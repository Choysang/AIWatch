// Reader feed query: recent events joined with their main source and main post,
// shaped for the event card. Read path for the homepage and (later) /api/public/items.

import { and, arrayOverlaps, desc, eq, gte, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { loadReaderSignals } from "@/db/queries/reader-affinity";
import type { ReaderIdentity } from "@/db/queries/topic-boards";
import { events, posts, sources } from "@/db/schema";
import type { ContentType, PublicMode, SemanticWindow, SourceCategory, SourceType } from "@/public/query";
import { windowStart } from "@/public/query";
import { buildReaderAffinityProfile, computeReaderBoost } from "@/scoring/reader-affinity";
import type { PromotedLevel } from "@/scoring/types";

export interface EventCard {
  id: string;
  mainSourceId: string | null;
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
  sourceCount: number;
  likeCount: number;
  starCount: number;
  downCount: number;
  viewCount: number;
}

// Shared card projection so every reader feed query returns the same shape.
export const cardColumns = {
  id: events.id,
  mainSourceId: events.mainSourceId,
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
  sourceCount: events.sourceCount,
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
  downCount: events.downCount,
  viewCount: events.viewCount,
} as const;

// Strict newest-first over the same effective-time chain the reader timeline groups by
// (published → promoted → created; see timeline-tree.ts effectiveTime). 最新/精选 order by
// this chain so the HH:mm timeline rail reads top-to-bottom; quality discovery lives in 精选
// mode, personal relevance in 推荐 (which orders by affinity, not time — buildTimelineTree
// groups by civil-day key so a non-time-sorted feed still buckets cleanly). Keeping this sort
// time-based also stops old events from crowding today's items out of the LIMIT.
const effectiveTime = sql`coalesce(${events.publishedAt}, ${events.promotedAt}, ${events.createdAt})`;

/** Most recent events first (All AI Dynamics default sort): strict effective-time order. */
export async function listRecentEvents(limit = 30, db: DB = defaultDb): Promise<EventCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .orderBy(sql`${effectiveTime} desc`, desc(events.id))
    .limit(limit);
  return rows as EventCard[];
}

export interface FeedFilter {
  mode: PublicMode;
  since: SemanticWindow;
  q?: string;
  tags?: string[];
  sourceTypes?: SourceType[];
  sourceCategories?: SourceCategory[];
  /** Per-source filter: only events whose main source id is in this list. */
  sourceIds?: string[];
  /**
   * Board "interest" (A/B v0.5): an OR group — events carrying ANY of these tags OR from ANY
   * of these sources. Distinct from the AND-combined `tags`/`sourceIds` facets above; backs
   * opening a topic board and the 推荐 aggregate feed.
   */
  interests?: { tags: string[]; sourceIds: string[] };
  contentTypes?: ContentType[];
  level?: PromotedLevel;
  minScore?: number;
  category?: string;
  /** Custom date range (overrides `since` when either bound is present). See PublicQuery. */
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Filtered reader feed (search + filter UI). Mirrors `listPublicItems` filter semantics:
 * selected mode windows by promotion time and excludes unselected events; all mode
 * windows by effective publish time. Both modes ORDER by the effective-time chain the
 * timeline groups by (strict newest-first). Search is server-side (ILIKE + tag overlap).
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
  if (typeof filter.minScore === "number") conds.push(gte(events.qualityScore, filter.minScore));
  if (filter.tags?.length) {
    conds.push(arrayOverlaps(events.tags, filter.tags));
  }
  if (filter.sourceTypes?.length) {
    // Restrict to events whose main source has one of the requested source_types.
    conds.push(inArray(sources.sourceType, filter.sourceTypes));
  }
  if (filter.sourceCategories?.length) {
    conds.push(arrayOverlaps(sources.categories, filter.sourceCategories));
  }
  if (filter.sourceIds?.length) {
    conds.push(inArray(events.mainSourceId, filter.sourceIds));
  }
  // Board interest: (tags overlap) OR (source in list). One OR group, not AND-narrowing.
  if (filter.interests) {
    const orParts: SQL[] = [];
    if (filter.interests.tags.length) {
      orParts.push(arrayOverlaps(events.tags, filter.interests.tags));
    }
    if (filter.interests.sourceIds.length) {
      orParts.push(inArray(events.mainSourceId, filter.interests.sourceIds));
    }
    if (orParts.length === 1) conds.push(orParts[0]!);
    else if (orParts.length > 1) {
      const combined = or(...orParts);
      if (combined) conds.push(combined);
    }
  }
  if (filter.contentTypes?.length) {
    conds.push(inArray(events.contentType, filter.contentTypes));
  }
  if (filter.q) {
    const like = `%${filter.q}%`;
    // Single trigram-indexed predicate over the denormalized search blob (events_search_trgm_idx).
    // Replaces a prior OR across ~25 columns that forced a full sequential scan. search_text already
    // folds in title/summaries/reco/tags/category; source + author names typically appear there too.
    conds.push(sql`${events.searchText} ilike ${like}`);
  }

  const rows = await db
    .select(cardColumns)
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${effectiveTime} desc`, desc(events.id))
    .limit(limit);
  return rows as EventCard[];
}

// 推荐 mode (v0.5 A3): personalized re-rank over a bounded recent candidate pool. The
// reader profile is built per request (not persisted — millions of rid identities). The
// default 最新 feed stays strict-time; this is a separate opt-in view.
const PERSONALIZED_POOL = 150;

/** Quality baseline a personal boost is added to (mirrors the home card emphasis fallback). */
function baseScore(card: EventCard): number {
  if (typeof card.qualityScore === "number") return card.qualityScore;
  const byLevel: Record<EventCard["selectedLevel"], number> = { S: 90, A: 75, B: 60, none: 45 };
  return byLevel[card.selectedLevel];
}

function effectiveTimeMs(card: EventCard): number {
  return (card.publishedAt ?? card.promotedAt ?? card.createdAt).getTime();
}

/**
 * Personalized feed: take the recent candidate pool (newest-first, the reader's filters
 * applied), then re-rank by base quality + per-reader affinity boost. Downed events are
 * dropped (P6). Cold start (no signals) returns the recent pool unchanged (P7), so a new
 * reader's 推荐 still shows fresh content.
 */
export async function searchPersonalized(
  identity: ReaderIdentity,
  filter: FeedFilter,
  limit = 30,
  now: Date = new Date(),
  db: DB = defaultDb,
): Promise<EventCard[]> {
  const poolSize = Math.max(limit, PERSONALIZED_POOL);
  const candidates = await searchEvents({ ...filter, mode: "all" }, poolSize, now, db);

  const { signals, downedEventIds } = await loadReaderSignals(identity, db);
  const profile = buildReaderAffinityProfile(signals);
  if (profile.isEmpty) return candidates.slice(0, limit);

  const downed = new Set(downedEventIds);
  return candidates
    .filter((card) => !downed.has(card.id))
    .map((card) => ({
      card,
      score:
        baseScore(card) +
        computeReaderBoost(
          {
            tags: card.tags,
            sourceId: card.mainSourceId,
            category: card.category,
            contentType: card.contentType,
          },
          profile,
        ),
    }))
    .sort((a, b) => b.score - a.score || effectiveTimeMs(b.card) - effectiveTimeMs(a.card))
    .slice(0, limit)
    .map((entry) => entry.card);
}
