// Operational alert: when LLM judging fails, posts keep arriving but no events are created.
// This job makes provider/no-key/budget failures visible immediately instead of letting the
// feed look stale for hours. Recipient follows SOURCE_ALERT_EMAIL, the same operator inbox as
// RSSHub/source alerts; unset recipient means log-only + admin dashboard visibility.

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { auditLogs, posts } from "@/db/schema";
import { log } from "@/log";
import { sendEmail } from "@/notify/email";

const ALERT_ACTION = "pipeline_health_alert";
const ALERT_COOLDOWN_HOURS = 3;
const LOOKBACK_HOURS = 1;
const ALERT_REASONS = ["provider_error", "no_key", "budget_exceeded"] as const;

export interface PipelineHealthAlertResult {
  failedCount: number;
  reasons: Record<string, number>;
  triggered: boolean;
  emailSent: boolean;
  skipped: "no_failures" | "cooldown" | "no_recipient" | "not_configured" | null;
}

export async function alertPipelineHealth(db: DB = defaultDb): Promise<PipelineHealthAlertResult> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const failures = await db
    .select({ reason: posts.judgeError, count: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(gte(posts.judgeFailedAt, since), inArray(posts.judgeError, [...ALERT_REASONS])))
    .groupBy(posts.judgeError)
    .orderBy(desc(sql`count(*)`));

  const reasons: Record<string, number> = {};
  let failedCount = 0;
  for (const row of failures) {
    if (!row.reason) continue;
    const count = Number(row.count) || 0;
    reasons[row.reason] = count;
    failedCount += count;
  }

  if (failedCount === 0) {
    return { failedCount, reasons, triggered: false, emailSent: false, skipped: "no_failures" };
  }

  const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, ALERT_ACTION), gte(auditLogs.createdAt, cooldownSince)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  if (recent[0]) {
    return { failedCount, reasons, triggered: true, emailSent: false, skipped: "cooldown" };
  }

  const recipient = process.env.SOURCE_ALERT_EMAIL?.trim();
  if (!recipient) {
    log.warn(
      `[alert-pipeline-health] ${failedCount} LLM judge failure(s) in ${LOOKBACK_HOURS}h but SOURCE_ALERT_EMAIL is unset`,
    );
    return { failedCount, reasons, triggered: true, emailSent: false, skipped: "no_recipient" };
  }

  const reasonText = Object.entries(reasons)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join("; ");
  const subject = `[AIWatch] LLM 判定链路异常：${failedCount} 条内容未生成事件`;
  const text =
    `最近 ${LOOKBACK_HOURS} 小时 AIWatch 有 ${failedCount} 条帖子在 LLM 判定阶段失败。\n\n` +
    `错误分布：${reasonText}\n\n` +
    `影响：帖子可能已经入库，但不会出现在最新/精选/日报事件流里。\n\n` +
    `处理建议：检查 LLM 网关、API Key、模型路由和 spend guard；恢复后运行 rejudge-failed-posts 补判积压内容。`;

  const result = await sendEmail({ to: recipient, subject, text });
  if (!result.sent) {
    return {
      failedCount,
      reasons,
      triggered: true,
      emailSent: false,
      skipped: result.skippedReason ?? "not_configured",
    };
  }

  await db.insert(auditLogs).values({
    id: newId("aud"),
    action: ALERT_ACTION,
    actorId: null,
    targetType: "post",
    reason: `emailed ${recipient}: ${failedCount} LLM judge failures`,
    after: { failedCount, reasons, recipient },
  });

  return { failedCount, reasons, triggered: true, emailSent: true, skipped: null };
}