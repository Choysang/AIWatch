// Event comments query layer (Slice 9; spec: Comments And Follow-Up).
//
// Comments are centered on the *event*, not the post (spec line 463). The list view
// has three sections (spec lines 465-469):
//   - Expert views: comments where isExpert was true at insert time.
//   - High-quality discussion: valid + non-expert. (V1: any comment classified valid;
//     a future slice will rank by reaction count + reply depth.)
//   - Latest comments: chronological tail of valid comments.
//
// The classifier (`src/comments/classifier`) is deterministic — no LLM — and runs
// synchronously inside addComment. Low-value comments are stored (so admins can audit
// and so re-submission is idempotent) but excluded from the listing sections.
//
// Identity = userId XOR fingerprint (matches event_reactions). Per-identity bodyHash
// dedupe is enforced by partial unique indexes; addComment swallows the unique-violation
// path and returns the existing row so re-submission is idempotent.

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { classifyComment, type CommentCategory, type CommentClassification } from "@/comments/classifier";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { eventComments, events, user as userTable } from "@/db/schema";

export interface CommentIdentity {
  /** Exactly one of userId / fingerprint must be set. */
  userId: string | null;
  fingerprint: string | null;
}

export interface CommentRow {
  id: string;
  eventId: string;
  userId: string | null;
  fingerprint: string | null;
  body: string;
  category: CommentCategory;
  classification: CommentClassification;
  isExpert: boolean;
  createdAt: Date;
}

export interface CommentSections {
  expertViews: CommentRow[];
  highQuality: CommentRow[];
  latest: CommentRow[];
}

export class CommentIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentIdentityError";
  }
}

export class EventNotFoundError extends Error {
  constructor(eventId: string) {
    super(`event not found: ${eventId}`);
    this.name = "EventNotFoundError";
  }
}

export class EmptyBodyError extends Error {
  constructor() {
    super("comment body must be non-empty");
    this.name = "EmptyBodyError";
  }
}

function assertIdentity(identity: CommentIdentity): void {
  const hasUser = identity.userId !== null && identity.userId !== "";
  const hasFp = identity.fingerprint !== null && identity.fingerprint !== "";
  if (hasUser === hasFp) {
    throw new CommentIdentityError("exactly one of userId/fingerprint must be set");
  }
}

function hashBody(body: string): string {
  // Trim + collapse whitespace so trivially-equal bodies dedupe. Hash truncated to
  // 32 chars (same width as the contributor fingerprint column).
  const normalized = body.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

async function fetchEventTitle(tx: Tx, eventId: string): Promise<string> {
  const rows = await tx
    .select({ id: events.id, title: events.title })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new EventNotFoundError(eventId);
  return row.title;
}

async function isExpertUser(tx: Tx, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const rows = await tx
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return rows[0]?.role === "expert";
}

async function findExisting(
  tx: Tx,
  eventId: string,
  identity: CommentIdentity,
  bodyHash: string,
): Promise<CommentRow | null> {
  const where = identity.userId
    ? and(
        eq(eventComments.eventId, eventId),
        eq(eventComments.userId, identity.userId),
        eq(eventComments.bodyHash, bodyHash),
      )
    : and(
        eq(eventComments.eventId, eventId),
        eq(eventComments.fingerprint, identity.fingerprint!),
        eq(eventComments.bodyHash, bodyHash),
      );
  const rows = await tx
    .select()
    .from(eventComments)
    .where(where)
    .limit(1);
  return (rows[0] as CommentRow | undefined) ?? null;
}

/**
 * Add a comment. Idempotent on (event, identity, bodyHash). Returns the persisted row
 * (whether newly inserted or pre-existing). Body is classified synchronously by the
 * deterministic rules in src/comments/classifier; low-value comments are still stored
 * so admins can audit, but listEventComments excludes them.
 */
export async function addComment(
  args: {
    eventId: string;
    body: string;
    identity: CommentIdentity;
  },
  db: DB = defaultDb,
): Promise<CommentRow> {
  assertIdentity(args.identity);
  const trimmed = args.body?.trim() ?? "";
  if (trimmed.length === 0) throw new EmptyBodyError();

  return db.transaction(async (tx) => {
    const title = await fetchEventTitle(tx, args.eventId);
    const bodyHash = hashBody(trimmed);

    // Dedupe inside the transaction. The partial unique indexes also enforce this at
    // the DB layer; the explicit check keeps the happy path on a SELECT instead of
    // an INSERT-and-catch.
    const existing = await findExisting(tx, args.eventId, args.identity, bodyHash);
    if (existing) return existing;

    const verdict = classifyComment({ body: trimmed, eventTitle: title });
    const isExpert = await isExpertUser(tx, args.identity.userId);

    const id = newId("cmt");
    await tx.insert(eventComments).values({
      id,
      eventId: args.eventId,
      userId: args.identity.userId,
      fingerprint: args.identity.fingerprint,
      body: trimmed,
      bodyHash,
      category: verdict.category,
      classification: verdict.classification,
      isExpert,
    });

    // Expert valid comment is a strong signal: reset the display-score decay clock.
    if (isExpert && verdict.classification === "valid") {
      await tx
        .update(events)
        .set({ lastStrongSignalAt: new Date() })
        .where(eq(events.id, args.eventId));
    }

    const inserted = await findExisting(tx, args.eventId, args.identity, bodyHash);
    if (!inserted) throw new Error("comment insert lost its row");
    return inserted;
  });
}

/**
 * List comments for an event in three sections (spec lines 465-469). Low-value comments
 * never surface here. Section sizes default to a reasonable UI page; callers can
 * override. `latest` may overlap with the other two sections — that's intentional, the
 * UI renders sections as distinct affordances.
 */
export async function listEventComments(
  eventId: string,
  opts: { expertLimit?: number; highQualityLimit?: number; latestLimit?: number } = {},
  db: DB = defaultDb,
): Promise<CommentSections> {
  const expertLimit = opts.expertLimit ?? 5;
  const highQualityLimit = opts.highQualityLimit ?? 10;
  const latestLimit = opts.latestLimit ?? 20;

  // One query per section keeps each result paged independently; the table is indexed
  // on (event_id, created_at) so all three are index scans.
  const validWhere = and(
    eq(eventComments.eventId, eventId),
    eq(eventComments.classification, "valid"),
  );

  const [expertViews, highQuality, latest] = await Promise.all([
    db
      .select()
      .from(eventComments)
      .where(and(validWhere, eq(eventComments.isExpert, true)))
      .orderBy(asc(eventComments.createdAt))
      .limit(expertLimit),
    db
      .select()
      .from(eventComments)
      .where(and(validWhere, eq(eventComments.isExpert, false)))
      .orderBy(asc(eventComments.createdAt))
      .limit(highQualityLimit),
    db
      .select()
      .from(eventComments)
      .where(validWhere)
      .orderBy(desc(eventComments.createdAt))
      .limit(latestLimit),
  ]);

  return {
    expertViews: expertViews as CommentRow[],
    highQuality: highQuality as CommentRow[],
    latest: latest as CommentRow[],
  };
}

/**
 * Batch the top-N valid reader comments for a set of events, for the homepage card
 * ticker. "Hot" in V1 = most recent valid (event_comments has no vote column yet); a
 * later slice can re-rank by reaction count. Returns a Map keyed by eventId; events with
 * no valid comments are simply absent. One indexed scan + JS bucketing keeps it cheap.
 */
export async function getTopCommentsForEvents(
  eventIds: string[],
  perEvent = 3,
  db: DB = defaultDb,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (eventIds.length === 0) return result;

  const rows = await db
    .select({ eventId: eventComments.eventId, body: eventComments.body })
    .from(eventComments)
    .where(and(inArray(eventComments.eventId, eventIds), eq(eventComments.classification, "valid")))
    .orderBy(desc(eventComments.createdAt));

  for (const row of rows) {
    const bucket = result.get(row.eventId);
    if (bucket) {
      if (bucket.length < perEvent) bucket.push(row.body);
    } else {
      result.set(row.eventId, [row.body]);
    }
  }
  return result;
}
