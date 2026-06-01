// Reader feed query: recent events joined with their main source and main post,
// shaped for the event card. Read path for the homepage and (later) /api/public/items.

import { and, arrayOverlaps, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, sources } from "@/db/schema";
import type { ContentType, PublicMode, SemanticWindow, SourceType } from "@/public/query";
import { windowStart } from "@/public/query";
import type { PromotedLevel } from "@/scoring/types";

export interface EventCard {
  id: string;
  title: string;
  summary: string | null;
  recommendationReason: string | null;
  category: string | null;
  contentType: string | null;
  tags: string[];
  qualityScore: number | null;
  selectedLevel: "none" | "B" | "A" | "S";
  selectedLabel: string | null;
  publishedAt: Date | null;
  promotedAt: Date | null;
  createdAt: Date;
  sourceName: string | null;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  sourceBrandTag: string | null;
  sourceRecommendedBy: string | null;
  sourceRecommendReason: string | null;
  sourceOnboardedAt: Date | null;
  authorName: string | null;
  authorHandle: string | null;
  url: string | null;
  media: unknown;
  likeCount: number;
  starCount: number;
}

// Shared card projection so every reader feed query returns the same shape.
const cardColumns = {
  id: events.id,
  title: events.title,
  summary: events.summary,
  recommendationReason: events.recommendationReason,
  category: events.category,
  contentType: events.contentType,
  tags: events.tags,
  qualityScore: events.qualityScore,
  selectedLevel: events.selectedLevel,
  selectedLabel: events.selectedLabel,
  publishedAt: events.publishedAt,
  promotedAt: events.promotedAt,
  createdAt: events.createdAt,
  media: events.media,
  sourceName: sources.name,
  sourcePlatform: sources.platform,
  sourceUrl: sources.url,
  sourceType: sources.sourceType,
  sourceBrandTag: sources.brandTag,
  sourceRecommendedBy: sources.recommendedBy,
  sourceRecommendReason: sources.recommendReason,
  sourceOnboardedAt: sources.onboardedAt,
  authorName: posts.authorName,
  authorHandle: posts.authorHandle,
  url: posts.url,
  likeCount: events.likeCount,
  starCount: events.starCount,
} as const;

/** Most recent events first (All AI Dynamics default sort). */
export async function listRecentEvents(limit = 30, db: DB = defaultDb): Promise<EventCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .orderBy(desc(events.publishedAt), desc(events.createdAt))
    .limit(limit);
  return rows as EventCard[];
}

export interface FeedFilter {
  mode: PublicMode;
  since: SemanticWindow;
  q?: string;
  tags?: string[];
  sourceTypes?: SourceType[];
  contentTypes?: ContentType[];
  level?: PromotedLevel;
  category?: string;
  /** Custom date range (overrides `since` when either bound is present). See PublicQuery. */
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Filtered reader feed (search + filter UI). Mirrors `listPublicItems` semantics:
 * selected mode sorts by promotion time and excludes unselected events; all mode
 * sorts by effective publish time. Search is server-side (ILIKE + tag overlap).
 */
export async function searchEvents(
  filter: FeedFilter,
  limit = 30,
  now: Date = new Date(),
  db: DB = defaultDb,
): Promise<EventCard[]> {
  const sortKey: SQL =
    filter.mode === "selected"
      ? sql`${events.promotedAt}`
      : sql`coalesce(${events.publishedAt}, ${events.createdAt})`;

  const conds: SQL[] = [];
  if (filter.mode === "selected") {
    conds.push(ne(events.selectedLevel, "none"));
    if (filter.level) conds.push(eq(events.selectedLevel, filter.level));
  }
  // Custom range (explicit from/to) takes precedence over the rolling `since` window.
  const customRange = Boolean(filter.dateFrom || filter.dateTo);
  const start = customRange ? filter.dateFrom : windowStart(filter.since, now);
  if (start) conds.push(sql`${sortKey} >= ${start}`);
  if (filter.dateTo) conds.push(sql`${sortKey} < ${filter.dateTo}`);
  if (filter.category) conds.push(eq(events.category, filter.category));
  if (filter.tags?.length) {
    conds.push(arrayOverlaps(events.tags, filter.tags));
  }
  if (filter.sourceTypes?.length) {
    // Restrict to events whose main source has one of the requested source_types.
    conds.push(inArray(sources.sourceType, filter.sourceTypes));
  }
  if (filter.contentTypes?.length) {
    conds.push(inArray(events.contentType, filter.contentTypes));
  }
  if (filter.q) {
    const like = `%${filter.q}%`;
    conds.push(
      sql`(${events.title} ilike ${like} or ${events.summary} ilike ${like} or ${sources.name} ilike ${like} or exists (select 1 from unnest(${events.tags}) tag where tag ilike ${like}))`,
    );
  }

  const rows = await db
    .select(cardColumns)
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${sortKey} desc nulls last`, desc(events.id))
    .limit(limit);
  return rows as EventCard[];
}
