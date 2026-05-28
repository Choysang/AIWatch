// Public read-API query model (decision 13). Pure parsing + keyset cursor so the route
// handler stays thin and the rules are unit-testable. Semantic windows are resolved
// server-side (decision E) — clients/agents never compute date boundaries.

import type { PromotedLevel } from "@/scoring/types";

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
  category?: string;
  q?: string;
  /** Exact tag filter (matches events carrying ANY of these tags). */
  tags?: string[];
  /** Source-type facet (ANY-of). Undefined = no filter. */
  sourceTypes?: SourceType[];
  level?: PromotedLevel;
  take: number;
  cursor?: Cursor;
}

const SOURCE_TYPE_SET: ReadonlySet<string> = new Set(SOURCE_TYPES);
function isSourceType(v: string): v is SourceType {
  return SOURCE_TYPE_SET.has(v);
}

function clampTake(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TAKE;
  return Math.min(Math.floor(n), MAX_TAKE);
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

/** Window start as a Date, or null for `all` (no time bound). */
export function windowStart(since: SemanticWindow, now: Date): Date | null {
  if (since === "all") return null;
  return new Date(now.getTime() - WINDOW_DAYS[since] * 24 * 60 * 60 * 1000);
}

export function parsePublicQuery(params: URLSearchParams): PublicQuery {
  const mode: PublicMode = params.get("mode") === "all" ? "all" : "selected";
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

  const category = params.get("category")?.trim() || undefined;
  const q = params.get("q")?.trim() || undefined;
  const tags = parseTags(params.get("tags"));
  const sourceTypes = parseSourceTypes(params.get("sourceTypes"));

  return {
    mode,
    since,
    category,
    q,
    tags,
    sourceTypes,
    level,
    take: clampTake(params.get("take")),
    cursor: decodeCursor(params.get("cursor")),
  };
}
