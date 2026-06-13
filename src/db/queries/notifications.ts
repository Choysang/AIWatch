// Reader notifications query layer (SP3.3 point 7).
//
// Only logged-in users have an inbox; anonymous fingerprints aren't reliably addressable
// (a notification you can never see is noise). Writers (addComment / addCommentReaction /
// applyContribution) call createNotification *inside their existing transaction*, so this
// module must never throw on the dedup path: a throw inside db.transaction triggers the
// node-postgres rollback path that hangs under bun (documented in db/jobs/contributions.ts).
// We therefore dedup comment_like with an explicit pre-check SELECT rather than catching the
// partial-unique-index violation. The index stays as a backstop for concurrent writers.

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { notifications } from "@/db/schema";

export type NotificationKind =
  | "comment_reply"
  | "comment_like"
  | "source_approved"
  | "contribution_digest";

export interface NotificationRow {
  id: string;
  userId: string;
  kind: NotificationKind;
  actorId: string | null;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  eventId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  /** Recipient — always a logged-in user id. */
  userId: string;
  kind: NotificationKind;
  /** Triggering identity token (userId or fingerprint); null for system notifications. */
  actorId?: string | null;
  title: string;
  body?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  eventId?: string | null;
}

// Accept either the pooled client or a transaction handle so writers can enlist the
// notification insert in their own transaction.
type Executor = DB | Tx;

/**
 * Create a notification. comment_like is deduped per (recipient, comment=target, actor) so
 * repeated like/unlike never spams; the dedup is an explicit SELECT (not an index-violation
 * catch) to stay transaction-safe. Returns the row (new or the pre-existing dedup hit).
 */
export async function createNotification(
  input: CreateNotificationInput,
  db: Executor = defaultDb,
): Promise<NotificationRow> {
  const actorId = input.actorId ?? null;

  if (input.kind === "comment_like" && input.targetId) {
    const existing = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.kind, "comment_like"),
          eq(notifications.targetId, input.targetId),
          actorId === null ? isNull(notifications.actorId) : eq(notifications.actorId, actorId),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0] as NotificationRow;
  }

  const id = newId("ntf");
  await db.insert(notifications).values({
    id,
    userId: input.userId,
    kind: input.kind,
    actorId,
    title: input.title,
    body: input.body ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    eventId: input.eventId ?? null,
  });

  const rows = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("notification insert lost its row");
  return row as NotificationRow;
}

/** Recent notifications for a user, newest-first. */
export async function listNotifications(
  userId: string,
  opts: { limit?: number } = {},
  db: DB = defaultDb,
): Promise<NotificationRow[]> {
  const limit = opts.limit ?? 50;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows as NotificationRow[];
}

/** Unread notifications for the masthead hover preview, newest-first. */
export async function listUnreadPreview(
  userId: string,
  opts: { limit?: number } = {},
  db: DB = defaultDb,
): Promise<NotificationRow[]> {
  const limit = opts.limit ?? 5;
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows as NotificationRow[];
}

/** Count of unread (read_at IS NULL) notifications for the bell badge. */
export async function countUnread(userId: string, db: DB = defaultDb): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.n ?? 0;
}

/**
 * Mark notifications read for a user. With `ids`, marks only those (scoped to the user, so a
 * caller can't read-clear someone else's rows); without, marks all of the user's unread rows.
 * Idempotent — already-read rows are untouched. Returns the number of rows newly marked.
 */
export async function markRead(
  userId: string,
  opts: { ids?: string[] } = {},
  db: DB = defaultDb,
): Promise<number> {
  const ownedAndUnread = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const where =
    opts.ids && opts.ids.length > 0
      ? and(ownedAndUnread, inArray(notifications.id, opts.ids))
      : ownedAndUnread;
  if (opts.ids && opts.ids.length === 0) return 0;

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(where)
    .returning({ id: notifications.id });
  return updated.length;
}
