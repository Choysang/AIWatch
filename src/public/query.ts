// Public read-API query model (decision 13). Pure parsing + keyset cursor so the route
// handler stays thin and the rules are unit-testable. Semantic windows are resolved
// server-side (decision E) — clients/agents never compute date boundaries.

import type { PromotedLevel } from "@/scoring/types";
import { INTELLIGENCE_DOMAINS, type IntelligenceDomain } from "@/pipeline/judge-schema";
import {
  AI_SOURCE_CATEGORIES,
  parseAiSourceCategories,
  type AiSourceCategory,
} from "@/sources/ai-source-categories";

export type PublicMode = "selected" | "all";
export type SemanticWindow = "today" | "week" | "month" | "all";

/**
 * Reader-facing source-type facet. Mirrors the `source_type` pgEnum on `sources` —
 * keep in sync if that enum changes. Used for the homepage filter chip group so readers
 * can scope to e.g. "only official accounts" or "only experts".
 */
export const SOURCE_TYPES = [
  "official",
  "employee",
  "expert",
  "kol",
  "media",
  "community",
  "open_source_project",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_CATEGORIES = AI_SOURCE_CATEGORIES;
export type SourceCategory = AiSourceCategory;
// Reader-facing article category. Mirrors INTELLIGENCE_DOMAINS (persisted on
// events.category as text).
export const EVENT_CATEGORIES = INTELLIGENCE_DOMAINS;
export type EventCategory = IntelligenceDomain;

/**
 * Internal content-type facet retained for API compatibility. The reader UI now uses the
 * `category` axis plus supplementary free-form tags.
 */
export const CONTENT_TYPES = [
  "release",
  "research",
  "howto",
  "opinion",
  "news",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const DEFAULT_TAKE = 20;
export const MAX_TAKE = 50;
/** Cap on distinct tag filters per request (keeps the array-overlap query bounded). */
export const MAX_TAGS = 10;

const WINDOW_DAYS: Record<Exclude<SemanticWindow, "all">, number> = {
  today: 1,
  week: 7,
  month: 30,
};

export interface Cursor {
  /** ISO timestamp of the sort key (promoted_at for selected, effective time for all). */
  t: string;
  id: string;
}

export interface PublicQuery {
  mode: PublicMode;
  since: SemanticWindow;
  category?: EventCategory;
  q?: string;
  /** Exact tag filter (matches events carrying ANY of these tags). */
  tags?: string[];
  /** Source-type facet (ANY-of). Undefined = no filter. */
  sourceTypes?: SourceType[];
  /** Reader-facing AI source category facet (ANY-of). Undefined = no filter. */
  sourceCategories?: SourceCategory[];
  /** Content-type facet (ANY-of). Undefined = no filter. */
  contentTypes?: ContentType[];
  level?: PromotedLevel;
  /** Minimum event quality score (0..100). Undefined = no score filter. */
  minScore?: number;
  /**
   * Explicit custom date range (SP2 point 3). When either bound is present the rolling
   * `since` window is ignored and these bounds apply instead. `dateFrom` is the inclusive
   * lower bound (UTC start of the user's "from" day); `dateTo` is the EXCLUSIVE upper bound
   * (UTC start of the day after the user's "to", so the "to" day is fully included).
   */
  dateFrom?: Date;
  dateTo?: Date;
  take: number;
  cursor?: Cursor;
}

const SOURCE_TYPE_SET: ReadonlySet<string> = new Set(SOURCE_TYPES);
function isSourceType(v: string): v is SourceType {
  return SOURCE_TYPE_SET.has(v);
}

const CONTENT_TYPE_SET: ReadonlySet<string> = new Set(CONTENT_TYPES);
function isContentType(v: string): v is ContentType {
  return CONTENT_TYPE_SET.has(v);
}

const EVENT_CATEGORY_SET: ReadonlySet<string> = new Set(EVENT_CATEGORIES);
function isEventCategory(v: string): v is EventCategory {
  return EVENT_CATEGORY_SET.has(v);
}

function clampTake(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TAKE;
  return Math.min(Math.floor(n), MAX_TAKE);
}

function parseMinScore(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.floor(n);
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): Cursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Cursor).t === "string" &&
      typeof (parsed as Cursor).id === "string" &&
      !Number.isNaN(Date.parse((parsed as Cursor).t))
    ) {
      return parsed as Cursor;
    }
  } catch {
    // malformed cursor -> treated as no cursor (first page)
  }
  return undefined;
}

/** Parse a comma-separated `tags` param into a trimmed, de-duped, capped list (or undefined). */
export function parseTags(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return seen.size ? [...seen] : undefined;
}

/** Parse a comma-separated `sourceTypes` param. Unknown values are silently dropped. */
export function parseSourceTypes(raw: string | null): SourceType[] | undefined {
  if (!raw) return undefined;
  const seen = new Set<SourceType>();
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && isSourceType(v)) seen.add(v);
  }
  return seen.size ? [...seen] : undefined;
}

/** Parse a comma-separated `sourceCategories` param. Unknown values are silently dropped. */
export function parseSourceCategories(raw: string | null): SourceCategory[] | undefined {
  return parseAiSourceCategories(raw);
}

/** Parse a comma-separated `contentTypes` param. Unknown values are silently dropped. */
export function parseContentTypes(raw: string | null): ContentType[] | undefined {
  if (!raw) return undefined;
  const seen = new Set<ContentType>();
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && isContentType(v)) seen.add(v);
  }
  return seen.size ? CONTENT_TYPES.filter((t) => seen.has(t)) : undefined;
}

export function parseEventCategory(raw: string | null): EventCategory | undefined {
  const value = raw?.trim();
  return value && isEventCategory(value) ? value : undefined;
}

/** Window start as a Date, or null for `all` (no time bound). */
export function windowStart(since: SemanticWindow, now: Date): Date | null {
  if (since === "all") return null;
  return new Date(now.getTime() - WINDOW_DAYS[since] * 24 * 60 * 60 * 1000);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a YYYY-MM-DD calendar date as UTC midnight. Returns undefined for malformed input. */
function parseIsoDate(raw: string | null): Date | undefined {
  if (!raw || !DATE_RE.test(raw)) return undefined;
  const d = new Date(`${raw}T00:00:00.000Z`);
  // Reject impossible dates that JS would otherwise roll over (e.g. 2026-02-30).
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return undefined;
  return d;
}

/**
 * Parse the `from` / `to` custom-range params. `to` is shifted to the EXCLUSIVE start of the
 * next day so the user's end date is fully included. An inverted range (from >= to) is dropped
 * rather than returning an empty window silently.
 */
export function parseDateRange(
  fromRaw: string | null,
  toRaw: string | null,
): { dateFrom?: Date; dateTo?: Date } {
  const dateFrom = parseIsoDate(fromRaw);
  const toDay = parseIsoDate(toRaw);
  const dateTo = toDay ? new Date(toDay.getTime() + DAY_MS) : undefined;
  if (dateFrom && dateTo && dateFrom.getTime() >= dateTo.getTime()) {
    return {}; // inverted/empty range -> treat as no range
  }
  return { dateFrom, dateTo };
}

export function parsePublicQuery(params: URLSearchParams): PublicQuery {
  const mode: PublicMode =
    params.get("mode") === "latest" || params.get("mode") === "all" ? "all" : "selected";
  const sinceRaw = params.get("since");
  const since: SemanticWindow =
    sinceRaw === "today" || sinceRaw === "week" || sinceRaw === "month" || sinceRaw === "all"
      ? sinceRaw
      : mode === "selected"
        ? "week" // sensible default for "what's hot": this week's selected
        : "all";

  const levelRaw = params.get("level");
  const level: PromotedLevel | undefined =
    levelRaw === "B" || levelRaw === "A" || levelRaw === "S" ? levelRaw : undefined;

  const category = parseEventCategory(params.get("category"));
  const q = params.get("q")?.trim() || undefined;
  const tags = parseTags(params.get("tags"));
  const sourceTypes = parseSourceTypes(params.get("sourceTypes"));
  const sourceCategories = parseSourceCategories(params.get("sourceCategories"));
  const contentTypes = parseContentTypes(params.get("contentTypes"));
  const { dateFrom, dateTo } = parseDateRange(params.get("from"), params.get("to"));
  const minScore = parseMinScore(params.get("minScore"));

  return {
    mode,
    since,
    category,
    q,
    tags,
    sourceTypes,
    sourceCategories,
    contentTypes,
    level,
    minScore,
    dateFrom,
    dateTo,
    take: clampTake(params.get("take")),
    cursor: decodeCursor(params.get("cursor")),
  };
}
