// Comment reactions (SP3.1 point 7: like a comment).
//
// Mirrors src/db/queries/reactions.ts but keyed on the comment instead of the event,
// and limited to a single kind ("like"). Identity is XOR: either userId (logged-in) OR
// fingerprint (anonymous salted hash). Per-identity uniqueness is enforced by partial
// unique indexes in the DB (migration 0014). Add/remove are idempotent.
//
// event_comments.like_count is the denormalized tally, maintained transactionally with
// the reaction row insert/delete so the comment listing can stay flat.

import { and, eq, inArray, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { commentReactions, eventComments } from "@/db/schema";
import { createNotification } from "@/db/queries/notifications";
import { messages } from "@/i18n";

export interface CommentReactionIdentity {
  /** Exactly one of userId / fingerprint must be set. */
  userId: string | null;
  fingerprint: string | null;
}

export interface CommentLikeResult {
  commentId: string;
  likeCount: number;
}

export class CommentReactionIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentReactionIdentityError";
  }
}

export class CommentNotFoundError extends Error {
  constructor(commentId: string) {
    super(`comment not found: ${commentId}`);
    this.name = "CommentNotFoundError";
  }
}

function assertIdentity(identity: CommentReactionIdentity): void {
  const hasUser = identity.userId !== null && identity.userId !== "";
  const hasFp = identity.fingerprint !== null && identity.fingerprint !== "";
  if (hasUser === hasFp) {
    throw new CommentReactionIdentityError(
      "exactly one of userId/fingerprint must be set",
    );
  }
}

/** Internal: locate an existing like by identity, returning row id or null. */
async function findExisting(
  tx: Tx,
  commentId: string,
  identity: CommentReactionIdentity,
): Promise<string | null> {
  const where = identity.userId
    ? and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.kind, "like"),
        eq(commentReactions.userId, identity.userId),
      )
    : and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.kind, "like"),
        eq(commentReactions.fingerprint, identity.fingerprint!),
      );
  const rows = await tx
    .select({ id: commentReactions.id })
    .from(commentReactions)
    .where(where)
    .limit(1);
  return rows[0]?.id ?? null;
}

async function readLikeCount(tx: Tx, commentId: string): Promise<CommentLikeResult> {
  const rows = await tx
    .select({ id: eventComments.id, likeCount: eventComments.likeCount })
    .from(eventComments)
    .where(eq(eventComments.id, commentId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new CommentNotFoundError(commentId);
  return { commentId: row.id, likeCount: row.likeCount };
}

/** The liked comment's author + event, for addressing the comment_like notification. */
async function readCommentTarget(
  tx: Tx,
  commentId: string,
): Promise<{ userId: string | null; eventId: string }> {
  const rows = await tx
    .select({ userId: eventComments.userId, eventId: eventComments.eventId })
    .from(eventComments)
    .where(eq(eventComments.id, commentId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new CommentNotFoundError(commentId);
  return { userId: row.userId, eventId: row.eventId };
}

/**
 * Like a comment. Idempotent: returns the current count even when the (identity)
 * already liked it. Throws CommentNotFoundError if the comment doesn't exist.
 */
export async function addCommentReaction(
  args: { commentId: string; identity: CommentReactionIdentity },
  db: DB = defaultDb,
): Promise<CommentLikeResult> {
  assertIdentity(args.identity);
  return db.transaction(async (tx) => {
    await readLikeCount(tx, args.commentId); // existence check

    const existing = await findExisting(tx, args.commentId, args.identity);
    if (existing) return readLikeCount(tx, args.commentId);

    await tx.insert(commentReactions).values({
      id: newId("crx"),
      commentId: args.commentId,
      kind: "like",
      userId: args.identity.userId,
      fingerprint: args.identity.fingerprint,
    });
    await tx
      .update(eventComments)
      .set({ likeCount: sql`${eventComments.likeCount} + 1` })
      .where(eq(eventComments.id, args.commentId));

    // SP3.3: notify the comment's author of a new like. Addressable only when the author is
    // a logged-in user; never self-notify; deduped per (author, comment, actor) so repeated
    // like/unlike doesn't spam (the dedup lives in createNotification).
    const target = await readCommentTarget(tx, args.commentId);
    if (target.userId && target.userId !== args.identity.userId) {
      await createNotification(
        {
          userId: target.userId,
          kind: "comment_like",
          actorId: args.identity.userId ?? args.identity.fingerprint,
          title: messages.notifications.title.commentLike,
          targetType: "comment",
          targetId: args.commentId,
          eventId: target.eventId,
        },
        tx,
      );
    }

    return readLikeCount(tx, args.commentId);
  });
}

/**
 * Unlike a comment. Idempotent: returns the current count even when no like was present.
 * GREATEST guard keeps the denormalized counter from going negative.
 */
export async function removeCommentReaction(
  args: { commentId: string; identity: CommentReactionIdentity },
  db: DB = defaultDb,
): Promise<CommentLikeResult> {
  assertIdentity(args.identity);
  return db.transaction(async (tx) => {
    await readLikeCount(tx, args.commentId);

    const existing = await findExisting(tx, args.commentId, args.identity);
    if (!existing) return readLikeCount(tx, args.commentId);

    await tx.delete(commentReactions).where(eq(commentReactions.id, existing));
    await tx
      .update(eventComments)
      .set({ likeCount: sql`GREATEST(${eventComments.likeCount} - 1, 0)` })
      .where(eq(eventComments.id, args.commentId));

    return readLikeCount(tx, args.commentId);
  });
}

/**
 * Per-comment like state for the current viewer. Returns a map keyed by comment id
 * (present only for liked comments). Empty input or null identity short-circuits to an
 * empty map so SSR doesn't pay for a query when there's no one to look up.
 */
export async function getViewerCommentReactions(
  commentIds: string[],
  identity: CommentReactionIdentity,
  db: DB = defaultDb,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (commentIds.length === 0) return out;
  const hasUser = identity.userId !== null && identity.userId !== "";
  const hasFp = identity.fingerprint !== null && identity.fingerprint !== "";
  if (!hasUser && !hasFp) return out;

  const idCond = hasUser
    ? eq(commentReactions.userId, identity.userId!)
    : eq(commentReactions.fingerprint, identity.fingerprint!);

  const rows = await db
    .select({ commentId: commentReactions.commentId })
    .from(commentReactions)
    .where(and(inArray(commentReactions.commentId, commentIds), eq(commentReactions.kind, "like"), idCond));

  for (const r of rows) out.set(r.commentId, true);
  return out;
}
