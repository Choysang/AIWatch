// Event comments query layer (Slice 9; spec: Comments And Follow-Up).
//
// Comments are centered on the *event*, not the post. Reader UI shows a single comment
// list sorted either by latest activity or hotness (likes, then recency).
//
// The classifier (`src/comments/classifier`) is deterministic — no LLM — and runs
// synchronously inside addComment. Low-value comments are stored (so admins can audit
// and so re-submission is idempotent) but excluded from the listing sections.
//
// Identity = userId XOR fingerprint (matches event_reactions). Per-identity bodyHash
// dedupe is enforced by partial unique indexes; addComment swallows the unique-violation
// path and returns the existing row so re-submission is idempotent.

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { classifyComment, type CommentCategory, type CommentClassification } from "@/comments/classifier";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { eventComments, events, user as userTable } from "@/db/schema";
import { createNotification } from "@/db/queries/notifications";
import { messages } from "@/i18n";

/** Trim a comment body to a short single-line excerpt for notification previews. */
function excerpt(body: string, max = 120): string {
  const oneLine = body.trim().replace(/\s+/g, " ");
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

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
  // SP3.1: single-level threads. Top-level comments have parentId = null; a reply points
  // at its top-level parent. likeCount is the denormalized tally (see comment-reactions.ts).
  parentId: string | null;
  likeCount: number;
  createdAt: Date;
}

/** A top-level comment with its (valid) replies nested underneath. */
export interface CommentWithReplies extends CommentRow {
  replies: CommentRow[];
}

export type CommentSort = "latest" | "hot";

export interface CommentSections {
  sort: CommentSort;
  items: CommentWithReplies[];
  // Legacy shape retained for older callers during the UI transition.
  expertViews: CommentWithReplies[];
  highQuality: CommentWithReplies[];
  latest: CommentWithReplies[];
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

/** parentId did not resolve to a top-level comment on the same event. */
export class InvalidParentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParentError";
  }
}

export function parseCommentSort(raw: string | null): CommentSort {
  return raw === "hot" ? "hot" : "latest";
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

/**
 * Validate a reply target: the parent must exist, belong to the same event, and itself
 * be top-level (single-level threads — a reply-to-reply re-targets the top-level
 * ancestor at the UI layer, never the data layer). Throws InvalidParentError otherwise.
 */
async function fetchValidParent(
  tx: Tx,
  eventId: string,
  parentId: string,
): Promise<{ userId: string | null }> {
  const rows = await tx
    .select({
      eventId: eventComments.eventId,
      parentId: eventComments.parentId,
      userId: eventComments.userId,
    })
    .from(eventComments)
    .where(eq(eventComments.id, parentId))
    .limit(1);
  const parent = rows[0];
  if (!parent) throw new InvalidParentError(`parent comment not found: ${parentId}`);
  if (parent.eventId !== eventId) {
    throw new InvalidParentError("parent comment belongs to a different event");
  }
  if (parent.parentId !== null) {
    throw new InvalidParentError("replies are single-level; cannot reply to a reply");
  }
  return { userId: parent.userId };
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
    /** SP3.1: when set, this comment is a reply to the given top-level comment. */
    parentId?: string | null;
  },
  db: DB = defaultDb,
): Promise<CommentRow> {
  assertIdentity(args.identity);
  const trimmed = args.body?.trim() ?? "";
  if (trimmed.length === 0) throw new EmptyBodyError();
  const parentId = args.parentId ?? null;

  return db.transaction(async (tx) => {
    const title = await fetchEventTitle(tx, args.eventId);
    const parent = parentId !== null ? await fetchValidParent(tx, args.eventId, parentId) : null;
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
      parentId,
    });

    // Expert valid comment is a strong signal: reset the display-score decay clock.
    if (isExpert && verdict.classification === "valid") {
      await tx
        .update(events)
        .set({ lastStrongSignalAt: new Date() })
        .where(eq(events.id, args.eventId));
    }

    // SP3.3: notify the parent comment's author of a new reply. Only addressable when the
    // author is a logged-in user, and never self-notify (replying to your own comment).
    if (parent && parent.userId && parent.userId !== args.identity.userId) {
      await createNotification(
        {
          userId: parent.userId,
          kind: "comment_reply",
          actorId: args.identity.userId ?? args.identity.fingerprint,
          title: messages.notifications.title.commentReply,
          body: excerpt(trimmed),
          targetType: "event",
          targetId: args.eventId,
          eventId: args.eventId,
        },
        tx,
      );
    }

    const inserted = await findExisting(tx, args.eventId, args.identity, bodyHash);
    if (!inserted) throw new Error("comment insert lost its row");
    return inserted;
  });
}

/** List valid top-level comments for an event. Replies are nested underneath. */
export async function listEventComments(
  eventId: string,
  opts: {
    sort?: CommentSort;
    limit?: number;
    /** Legacy option accepted as a list limit for older callers. */
    latestLimit?: number;
  } = {},
  db: DB = defaultDb,
): Promise<CommentSections> {
  const sort = opts.sort ?? "latest";
  const limit = opts.limit ?? opts.latestLimit ?? 30;

  // List TOP-LEVEL comments only (parent_id IS NULL); replies nest underneath.
  // The table is indexed on (event_id, created_at) and parent_id.
  const validTopLevel = and(
    eq(eventComments.eventId, eventId),
    eq(eventComments.classification, "valid"),
    isNull(eventComments.parentId),
  );

  const rows =
    sort === "hot"
      ? await db
          .select()
          .from(eventComments)
          .where(validTopLevel)
          .orderBy(desc(eventComments.likeCount), desc(eventComments.createdAt))
          .limit(limit)
      : await db
          .select()
          .from(eventComments)
          .where(validTopLevel)
          .orderBy(desc(eventComments.createdAt))
          .limit(limit);

  const items = rows as CommentRow[];
  const repliesByParent = await fetchRepliesByParent(
    db,
    items.map((c) => c.id),
  );
  const withReplies = items.map((c): CommentWithReplies => ({
    ...c,
    replies: repliesByParent.get(c.id) ?? [],
  }));

  return {
    sort,
    items: withReplies,
    expertViews: [],
    highQuality: [],
    latest: withReplies,
  };
}

/**
 * Fetch all valid replies for a set of top-level comment ids in one indexed scan, bucketed
 * by parent id (oldest-first within each thread). Low-value replies are excluded, mirroring
 * the top-level filter. Returns an empty map for empty input.
 */
async function fetchRepliesByParent(
  db: DB,
  parentIds: string[],
): Promise<Map<string, CommentRow[]>> {
  const out = new Map<string, CommentRow[]>();
  if (parentIds.length === 0) return out;
  const uniqueIds = [...new Set(parentIds)];

  const rows = await db
    .select()
    .from(eventComments)
    .where(
      and(
        inArray(eventComments.parentId, uniqueIds),
        eq(eventComments.classification, "valid"),
      ),
    )
    .orderBy(asc(eventComments.createdAt));

  for (const row of rows as CommentRow[]) {
    if (row.parentId === null) continue;
    const bucket = out.get(row.parentId);
    if (bucket) bucket.push(row);
    else out.set(row.parentId, [row]);
  }
  return out;
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
  if (eventIds.length === 0 || perEvent <= 0) return result;

  type TopCommentRow = { event_id: string; body: string };
  const rawRows = await db.execute(sql<TopCommentRow>`
    WITH ranked_comments AS (
      SELECT
        ${eventComments.eventId} AS event_id,
        ${eventComments.body} AS body,
        row_number() OVER (
          PARTITION BY ${eventComments.eventId}
          ORDER BY ${eventComments.createdAt} DESC, ${eventComments.id} DESC
        ) AS rn
      FROM ${eventComments}
      WHERE ${eventComments.eventId} IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})
        AND ${eventComments.classification} = ${"valid"}
        AND ${eventComments.parentId} IS NULL
    )
    SELECT event_id, body
    FROM ranked_comments
    WHERE rn <= ${perEvent}
    ORDER BY event_id ASC, rn ASC
  `);
  const rows = Array.isArray(rawRows)
    ? (rawRows as TopCommentRow[])
    : (((rawRows as unknown as { rows?: TopCommentRow[] }).rows) ?? []);

  for (const row of rows) {
    const bucket = result.get(row.event_id);
    if (bucket) {
      bucket.push(row.body);
    } else {
      result.set(row.event_id, [row.body]);
    }
  }
  return result;
}
