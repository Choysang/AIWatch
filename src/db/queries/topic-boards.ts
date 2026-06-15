// Topic boards query layer (v0.5 A1: 读者自定义「关注主题」DIY 核心).
//
// A board is a reader-owned set of tags[]; the board feed reuses feed.searchEvents({ tags })
// (events.tags && board.tags overlap, served by events_tags_gin_idx). Identity = userId XOR
// fingerprint (matches event_reactions / event_comments): logged-in readers own boards by
// account (persistent, cross-device); anonymous readers own them by the signed `rid` cookie
// (device-local). Strict XOR + per-identity case-insensitive unique name are enforced by
// migration 0027 (CHECK num_nonnulls + partial unique indexes); this layer normalizes input,
// caps counts, and surfaces friendly errors for the name-conflict / limit / not-found paths.

import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { topicBoards } from "@/db/schema";

// Limits double as anti-abuse (anonymous identities are cheap to mint) and UX sanity bounds.
// Exported so the API-route validators share one source of truth.
export const MAX_BOARDS_PER_IDENTITY = 30;
export const MAX_TAGS_PER_BOARD = 20;
export const MAX_SOURCES_PER_BOARD = 50;
export const MAX_BOARD_NAME_LENGTH = 40;
export const MAX_TAG_LENGTH = 40;
export const MAX_SOURCE_ID_LENGTH = 64;

export interface ReaderIdentity {
  /** Exactly one of userId / fingerprint must be set. */
  userId: string | null;
  fingerprint: string | null;
}

export interface TopicBoard {
  id: string;
  name: string;
  emoji: string | null;
  tags: string[];
  /** Optional source scope. The board matches tags OR these sources (see feed interests). */
  sourceIds: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardInput {
  name: string;
  tags: string[];
  sourceIds?: string[];
  emoji?: string | null;
  sortOrder?: number;
}

export interface BoardPatch {
  name?: string;
  tags?: string[];
  sourceIds?: string[];
  emoji?: string | null;
  sortOrder?: number;
}

export class BoardIdentityError extends Error {
  constructor() {
    super("identity must carry exactly one of userId / fingerprint");
    this.name = "BoardIdentityError";
  }
}
export class EmptyBoardNameError extends Error {
  constructor() {
    super("board name must be non-empty");
    this.name = "EmptyBoardNameError";
  }
}
export class BoardLimitError extends Error {
  constructor() {
    super(`board limit reached (max ${MAX_BOARDS_PER_IDENTITY})`);
    this.name = "BoardLimitError";
  }
}
export class BoardNameConflictError extends Error {
  constructor(name: string) {
    super(`a board named "${name}" already exists`);
    this.name = "BoardNameConflictError";
  }
}
export class BoardNotFoundError extends Error {
  constructor(id: string) {
    super(`board not found: ${id}`);
    this.name = "BoardNotFoundError";
  }
}

const boardColumns = {
  id: topicBoards.id,
  name: topicBoards.name,
  emoji: topicBoards.emoji,
  tags: topicBoards.tags,
  sourceIds: topicBoards.sourceIds,
  sortOrder: topicBoards.sortOrder,
  createdAt: topicBoards.createdAt,
  updatedAt: topicBoards.updatedAt,
} as const;

/** Throw unless exactly-one identity field is set (mirrors the DB XOR CHECK). */
function assertIdentity(identity: ReaderIdentity): void {
  const hasUser = Boolean(identity.userId);
  const hasFp = Boolean(identity.fingerprint);
  if (hasUser === hasFp) throw new BoardIdentityError();
}

/** Predicate selecting only rows owned by this identity (XOR columns => no cross-talk). */
function identityWhere(identity: ReaderIdentity): SQL {
  if (identity.userId) return eq(topicBoards.userId, identity.userId);
  if (identity.fingerprint) return eq(topicBoards.fingerprint, identity.fingerprint);
  throw new BoardIdentityError();
}

/** Collapse whitespace, cap length. Throws EmptyBoardNameError when nothing remains. */
function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_BOARD_NAME_LENGTH);
  if (!name) throw new EmptyBoardNameError();
  return name;
}

/** Trim, drop empties, cap each tag length, dedupe (case-sensitive), cap count. */
function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const tag = candidate.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_BOARD) break;
  }
  return out;
}

/** Trim, drop empties, cap each id length, dedupe, cap count. Mirrors normalizeTags for sources. */
function normalizeSourceIds(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const id = candidate.trim().slice(0, MAX_SOURCE_ID_LENGTH);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_SOURCES_PER_BOARD) break;
  }
  return out;
}

/** Keep up to a few graphemes for the cover emoji (preserves ZWJ/flag sequences), or null. */
function normalizeEmoji(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return [...trimmed].slice(0, 4).join("") || null;
}

function normalizeSortOrder(raw: number | undefined): number {
  return typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : 0;
}

async function countBoards(identity: ReaderIdentity, db: DB): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(topicBoards)
    .where(identityWhere(identity));
  return rows[0]?.count ?? 0;
}

/** True when this identity already has a board whose name matches (case-insensitive). */
async function nameTaken(
  identity: ReaderIdentity,
  name: string,
  excludeId: string | null,
  db: DB,
): Promise<boolean> {
  const conds: SQL[] = [identityWhere(identity), sql`lower(${topicBoards.name}) = lower(${name})`];
  if (excludeId) conds.push(sql`${topicBoards.id} <> ${excludeId}`);
  const rows = await db.select({ id: topicBoards.id }).from(topicBoards).where(and(...conds)).limit(1);
  return rows.length > 0;
}

/** All of this identity's boards, reader-sorted then oldest-first. */
export async function listBoards(
  identity: ReaderIdentity,
  db: DB = defaultDb,
): Promise<TopicBoard[]> {
  const rows = await db
    .select(boardColumns)
    .from(topicBoards)
    .where(identityWhere(identity))
    .orderBy(asc(topicBoards.sortOrder), asc(topicBoards.createdAt));
  return rows as TopicBoard[];
}

/** A single board owned by this identity, or null when missing / not owned. */
export async function getBoard(
  identity: ReaderIdentity,
  id: string,
  db: DB = defaultDb,
): Promise<TopicBoard | null> {
  const rows = await db
    .select(boardColumns)
    .from(topicBoards)
    .where(and(eq(topicBoards.id, id), identityWhere(identity)))
    .limit(1);
  return (rows[0] as TopicBoard | undefined) ?? null;
}

export async function createBoard(
  identity: ReaderIdentity,
  input: BoardInput,
  db: DB = defaultDb,
): Promise<TopicBoard> {
  assertIdentity(identity);
  const name = normalizeName(input.name);
  const tags = normalizeTags(input.tags);
  const sourceIds = normalizeSourceIds(input.sourceIds);
  const emoji = normalizeEmoji(input.emoji);
  const sortOrder = normalizeSortOrder(input.sortOrder);

  if ((await countBoards(identity, db)) >= MAX_BOARDS_PER_IDENTITY) throw new BoardLimitError();
  if (await nameTaken(identity, name, null, db)) throw new BoardNameConflictError(name);

  const id = newId("tb");
  await db.insert(topicBoards).values({
    id,
    userId: identity.userId,
    // Persist strict XOR even if the caller passed both: account wins, fingerprint cleared.
    fingerprint: identity.userId ? null : identity.fingerprint,
    name,
    emoji,
    tags,
    sourceIds,
    sortOrder,
  });
  const created = await getBoard(identity, id, db);
  if (!created) throw new BoardNotFoundError(id);
  return created;
}

export async function updateBoard(
  identity: ReaderIdentity,
  id: string,
  patch: BoardPatch,
  db: DB = defaultDb,
): Promise<TopicBoard> {
  assertIdentity(identity);
  const existing = await getBoard(identity, id, db);
  if (!existing) throw new BoardNotFoundError(id);

  const set: Partial<typeof topicBoards.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = normalizeName(patch.name);
    if (await nameTaken(identity, name, id, db)) throw new BoardNameConflictError(name);
    set.name = name;
  }
  if (patch.tags !== undefined) set.tags = normalizeTags(patch.tags);
  if (patch.sourceIds !== undefined) set.sourceIds = normalizeSourceIds(patch.sourceIds);
  if (patch.emoji !== undefined) set.emoji = normalizeEmoji(patch.emoji);
  if (patch.sortOrder !== undefined) set.sortOrder = normalizeSortOrder(patch.sortOrder);

  await db
    .update(topicBoards)
    .set(set)
    .where(and(eq(topicBoards.id, id), identityWhere(identity)));
  const updated = await getBoard(identity, id, db);
  if (!updated) throw new BoardNotFoundError(id);
  return updated;
}

export async function deleteBoard(
  identity: ReaderIdentity,
  id: string,
  db: DB = defaultDb,
): Promise<void> {
  assertIdentity(identity);
  const existing = await getBoard(identity, id, db);
  if (!existing) throw new BoardNotFoundError(id);
  await db.delete(topicBoards).where(and(eq(topicBoards.id, id), identityWhere(identity)));
}
