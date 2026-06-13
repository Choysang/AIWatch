// Hourly owner/admin digest of newly submitted contributions (信源推荐收集 slice B).
// Public submissions land in `contributions` as status=submitted and wait for human
// review in /_admin — nothing auto-applies (decision 14). This job closes the loop:
// once an hour it tells each owner/admin how many NEW submissions arrived, so the
// review queue never silently piles up.
//
// Stateless dedupe: a recipient is only notified about contributions created AFTER
// their latest contribution_digest notification, so a downtime gap never loses
// submissions and an empty hour never spams.

import { and, eq, gt, inArray, max, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { user } from "@/db/auth-schema";
import { contributions, notifications } from "@/db/schema";
import { createNotification } from "@/db/queries/notifications";

const RECIPIENT_ROLES = ["owner", "admin"] as const;

export interface ContributionDigestResult {
  recipients: number;
  notified: number;
  pendingTotal: number;
}

export async function digestPendingContributions(
  db: DB = defaultDb,
): Promise<ContributionDigestResult> {
  const recipients = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.role, [...RECIPIENT_ROLES]));

  const pendingRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contributions)
    .where(eq(contributions.status, "submitted"));
  const pendingTotal = pendingRows[0]?.n ?? 0;

  let notified = 0;
  for (const recipient of recipients) {
    const lastDigestRows = await db
      .select({ at: max(notifications.createdAt) })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, recipient.id),
          eq(notifications.kind, "contribution_digest"),
        ),
      );
    const lastDigestAt = lastDigestRows[0]?.at ?? null;

    const newRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(contributions)
      .where(
        and(
          eq(contributions.status, "submitted"),
          lastDigestAt ? gt(contributions.createdAt, lastDigestAt) : undefined,
        ),
      );
    const newCount = newRows[0]?.n ?? 0;
    if (newCount === 0) continue;

    await createNotification(
      {
        userId: recipient.id,
        kind: "contribution_digest",
        title: `有 ${newCount} 条新的信源推荐待审核`,
        body: `当前共 ${pendingTotal} 条待处理，请到管理后台「信源管理」审核。`,
        targetType: "contribution",
      },
      db,
    );
    notified++;
  }

  return { recipients: recipients.length, notified, pendingTotal };
}
