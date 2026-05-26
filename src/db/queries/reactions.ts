// Event reactions (likes + stars) — Slice 7 / decision: user feedback.
//
// Identity is XOR: either userId (logged-in) OR fingerprint (anonymous salted hash).
// Per-identity uniqueness per (eventId, kind) is enforced by partial unique indexes in
// the DB (see migration 0005). Add is idempotent: if the row already exists we no-op
// and return the current counts. Remove is also idempotent.
//
// Denormalized counts on events.{likeCount,starCount} are maintained transactionally
// with the row insert/delete so reads can stay flat.

import { and, eq, inArray, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { eventReactions, events } from "@/db/schema";

export type ReactionKind = "like" | "star";

export interface ReactionIdentity {
  /** Exactly one of userId / fingerprint must be set. */
  userId: string | null;
  fingerprint: string | null;
}

export interface ReactionCounts {
  eventId: string;
  likeCount: number;
  starCount: number;
}

export class ReactionIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReactionIdentityError";
  }
}

export class EventNotFoundError extends Error {
  constructor(eventId: string) {
    super(`event not found: ${eventId}`);
    this.name = "EventNotFoundError";
  }
}

function assertIdentity(identity: ReactionIdentity): void {
  const hasUser = identity.userId !== null && identity.userId !== "";
  const hasFp = identity.fingerprint !== null && identity.fingerprint !== "";
  if (hasUser === hasFp) {
    throw new ReactionIdentityError(
      "exactly one of userId/fingerprint must be set",
    );
  }
}

/** Internal: locate an existing reaction by identity, returning row id or null. */
async function findExisting(
  tx: Tx,
  eventId: string,
  kind: ReactionKind,
  identity: ReactionIdentity,
): Promise<string | null> {
  const where = identity.userId
    ? and(
        eq(eventReactions.eventId, eventId),
        eq(eventReactions.kind, kind),
        eq(eventReactions.userId, identity.userId),
      )
    : and(
        eq(eventReactions.eventId, eventId),
        eq(eventReactions.kind, kind),
        eq(eventReactions.fingerprint, identity.fingerprint!),
      );
  const rows = await tx
    .select({ id: eventReactions.id })
    .from(eventReactions)
    .where(where)
    .limit(1);
  return rows[0]?.id ?? null;
}

async function readCounts(tx: Tx, eventId: string): Promise<ReactionCounts> {
  const rows = await tx
    .select({
      id: events.id,
      likeCount: events.likeCount,
      starCount: events.starCount,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new EventNotFoundError(eventId);
  return { eventId: row.id, likeCount: row.likeCount, starCount: row.starCount };
}

/**
 * Add a reaction. Idempotent: returns the current counts even when the (identity, kind)
 * pair already exists. Throws EventNotFoundError if the event doesn't exist.
 */
export async function addReaction(
  args: {
    eventId: string;
    kind: ReactionKind;
    identity: ReactionIdentity;
  },
  db: DB = defaultDb,
): Promise<ReactionCounts> {
  assertIdentity(args.identity);
  return db.transaction(async (tx) => {
    // Ensure the event exists; this also locks counts implicitly via the later UPDATE.
    await readCounts(tx, args.eventId);

    const existing = await findExisting(tx, args.eventId, args.kind, args.identity);
    if (existing) {
      return readCounts(tx, args.eventId);
    }

    await tx.insert(eventReactions).values({
      id: newId("rx"),
      eventId: args.eventId,
      kind: args.kind,
      userId: args.identity.userId,
      fingerprint: args.identity.fingerprint,
    });

    const column = args.kind === "like" ? events.likeCount : events.starCount;
    await tx
      .update(events)
      .set(
        args.kind === "like"
          ? { likeCount: sql`${column} + 1` }
          : { starCount: sql`${column} + 1` },
      )
      .where(eq(events.id, args.eventId));

    return readCounts(tx, args.eventId);
  });
}

/**
 * Remove a reaction. Idempotent: returns the current counts even when no row was
 * present for this identity. Throws EventNotFoundError if the event doesn't exist.
 */
export async function removeReaction(
  args: {
    eventId: string;
    kind: ReactionKind;
    identity: ReactionIdentity;
  },
  db: DB = defaultDb,
): Promise<ReactionCounts> {
  assertIdentity(args.identity);
  return db.transaction(async (tx) => {
    await readCounts(tx, args.eventId);

    const existing = await findExisting(tx, args.eventId, args.kind, args.identity);
    if (!existing) {
      return readCounts(tx, args.eventId);
    }

    await tx.delete(eventReactions).where(eq(eventReactions.id, existing));

    const column = args.kind === "like" ? events.likeCount : events.starCount;
    // GREATEST guard: denormalized counter can never go negative, even if a manual
    // backfill ever desynced it from the row table.
    await tx
      .update(events)
      .set(
        args.kind === "like"
          ? { likeCount: sql`GREATEST(${column} - 1, 0)` }
          : { starCount: sql`GREATEST(${column} - 1, 0)` },
      )
      .where(eq(events.id, args.eventId));

    return readCounts(tx, args.eventId);
  });
}

/** Read current reaction counts for an event. */
export async function getReactionCounts(
  eventId: string,
  db: DB = defaultDb,
): Promise<ReactionCounts> {
  return readCounts(db as unknown as Tx, eventId);
}

/**
 * Per-event reaction state for the current viewer (Slice 8). Returns a map keyed by
 * event id containing { liked, starred } booleans. Empty input or null identity short-
 * circuits to an empty map so the SSR feed render doesn't pay for a query when there's
 * no one to look up.
 */
export async function getViewerReactions(
  eventIds: string[],
  identity: ReactionIdentity,
  db: DB = defaultDb,
): Promise<Map<string, { liked: boolean; starred: boolean }>> {
  const out = new Map<string, { liked: boolean; starred: boolean }>();
  if (eventIds.length === 0) return out;
  const hasUser = identity.userId !== null && identity.userId !== "";
  const hasFp = identity.fingerprint !== null && identity.fingerprint !== "";
  if (!hasUser && !hasFp) return out;

  const idCond = hasUser
    ? eq(eventReactions.userId, identity.userId!)
    : eq(eventReactions.fingerprint, identity.fingerprint!);

  const rows = await db
    .select({
      eventId: eventReactions.eventId,
      kind: eventReactions.kind,
    })
    .from(eventReactions)
    .where(and(inArray(eventReactions.eventId, eventIds), idCond));

  for (const r of rows) {
    const cur = out.get(r.eventId) ?? { liked: false, starred: false };
    if (r.kind === "like") cur.liked = true;
    if (r.kind === "star") cur.starred = true;
    out.set(r.eventId, cur);
  }
  return out;
}
