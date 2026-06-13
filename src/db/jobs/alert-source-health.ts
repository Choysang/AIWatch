// Operational alert: when the self-hosted RSSHub X routes start failing en masse, the
// most common cause is an expired/invalid TWITTER_AUTH_TOKEN — which silently dark-outs
// every X (Twitter) KOL source as they cross the auto-disable threshold. This hourly job
// detects that condition and emails the operator so the token can be refreshed before the
// feed goes stale. Recipient is SOURCE_ALERT_EMAIL (unset → log-only). Deduped via an
// audit_logs row so an ongoing outage emails at most once per cooldown window.

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { auditLogs, sources } from "@/db/schema";
import { newId } from "@/core/ids";
import { sendEmail } from "@/notify/email";
import { log } from "@/log";

// At least this many X sources failing (disabled/degraded) reads as a token problem rather
// than a single flaky account. Tuned for a ~24-source X pool; a couple of dead accounts is
// normal churn, a wave of them is the token.
const X_FAILURE_ALERT_THRESHOLD = 3;
const ALERT_COOLDOWN_HOURS = 12;
const ALERT_ACTION = "source_health_alert";
const FAILING_STATUSES = ["disabled", "degraded"] as const;

export interface SourceHealthAlertResult {
  failingXCount: number;
  triggered: boolean;
  emailSent: boolean;
  skipped: "below_threshold" | "cooldown" | "no_recipient" | "not_configured" | null;
}

export async function alertSourceHealth(db: DB = defaultDb): Promise<SourceHealthAlertResult> {
  const failing = await db
    .select({ name: sources.name })
    .from(sources)
    .where(
      and(eq(sources.platform, "x"), inArray(sources.healthStatus, [...FAILING_STATUSES])),
    );
  const failingXCount = failing.length;

  if (failingXCount < X_FAILURE_ALERT_THRESHOLD) {
    return { failingXCount, triggered: false, emailSent: false, skipped: "below_threshold" };
  }

  // Cooldown: one alert per outage. A prior alert inside the window means we already told them.
  const since = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, ALERT_ACTION), gte(auditLogs.createdAt, since)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  if (recent[0]) {
    return { failingXCount, triggered: true, emailSent: false, skipped: "cooldown" };
  }

  const recipient = process.env.SOURCE_ALERT_EMAIL?.trim();
  if (!recipient) {
    log.warn(
      `[alert-source-health] ${failingXCount} X sources failing but SOURCE_ALERT_EMAIL is unset — cannot notify`,
    );
    return { failingXCount, triggered: true, emailSent: false, skipped: "no_recipient" };
  }

  const names = failing.map((r) => r.name).slice(0, 10).join("、");
  const subject = `[AIWatch] ${failingXCount} 个 X 信源抓取失败，疑似 Twitter token 失效`;
  const text =
    `检测到 ${failingXCount} 个 X（Twitter）信源连续抓取失败并被自动停用，最可能的原因是自托管 RSSHub 的 ` +
    `TWITTER_AUTH_TOKEN 已失效或过期。\n\n受影响信源：${names}\n\n` +
    `处理：\n1. 重新获取 X 的 auth_token；\n` +
    `2. 更新 /srv/aiwatch/current/.env 的 TWITTER_AUTH_TOKEN 并重启 rsshub 容器；\n` +
    `3. 运行 reset-source-health 脚本恢复被停用的 X 信源。`;

  const result = await sendEmail({ to: recipient, subject, text });
  if (!result.sent) {
    return {
      failingXCount,
      triggered: true,
      emailSent: false,
      skipped: result.skippedReason ?? "not_configured",
    };
  }

  await db.insert(auditLogs).values({
    id: newId("aud"),
    action: ALERT_ACTION,
    actorId: null,
    targetType: "source",
    reason: `emailed ${recipient}: ${failingXCount} X sources failing`,
    after: { failingXCount, recipient },
  });

  return { failingXCount, triggered: true, emailSent: true, skipped: null };
}
