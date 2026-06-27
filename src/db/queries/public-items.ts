// Public items query (decision 13): cursor (keyset) pagination, hard page caps, no bulk
// export. Powers GET /api/public/items in both `selected` and `all` modes. Search is
// server-side (decision: agents must not fetch-and-grep); Slice 2 uses ILIKE, FTS later.

import { and, arrayOverlaps, desc, eq, gte, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, sources } from "@/db/schema";
import type { PublicItem, PublicItemsResponse } from "@/public/item";
import { encodeCursor, windowStart, type PublicQuery } from "@/public/query";

interface Row {
  id: string;
  title: string;
  summary: string | null;
  detailedSummary: string | null;
  recommendationReason: string | null;
  category: string | null;
  contentType: string | null;
  tags: string[];
  qualityScore: number | null;
  viewCount: number;
  selectedLevel: "none" | "B" | "A" | "S";
  selectedLabel: string | null;
  publishedAt: Date | null;
  promotedAt: Date | null;
  createdAt: Date;
  media: unknown;
  sourceName: string | null;
  authorName: string | null;
  authorHandle: string | null;
  url: string | null;
  fullText: string | null;
}

function toItem(r: Row): PublicItem {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    permalink: `/events/${r.id}`,
    body: r.fullText ?? r.detailedSummary ?? r.summary,
    source_name: r.sourceName,
    author_name: r.authorName,
    author_handle: r.authorHandle,
    summary: r.summary,
    recommendation_reason: r.recommendationReason,
    quality_score: r.qualityScore,
    view_count: r.viewCount,
    selected_level: r.selectedLevel,
    selected_label: r.selectedLabel,
    category: r.category,
    content_type: r.contentType,
    tags: r.tags,
    published_at: r.publishedAt?.toISOString() ?? null,
    promoted_at: r.promotedAt?.toISOString() ?? null,
    media: r.media,
  };
}

export async function listPublicItems(
  q: PublicQuery,
  now: Date = new Date(),
  db: DB = defaultDb,
): Promise<PublicItemsResponse> {
  // Sort key: selected -> promoted_at; all -> effective publish time.
  const sortKey: SQL =
    q.mode === "selected"
      ? sql`${events.promotedAt}`
      : sql`coalesce(${events.publishedAt}, ${events.createdAt})`;

  const conds: SQL[] = [];
  if (q.mode === "selected") {
    conds.push(ne(events.selectedLevel, "none"));
    if (q.level) conds.push(eq(events.selectedLevel, q.level));
  }
  // Custom range (explicit from/to) takes precedence over the rolling `since` window.
  const customRange = Boolean(q.dateFrom || q.dateTo);
  const start = customRange ? q.dateFrom : windowStart(q.since, now);
  if (start) conds.push(sql`${sortKey} >= ${start}`);
  if (q.dateTo) conds.push(sql`${sortKey} < ${q.dateTo}`);
  if (q.category) conds.push(eq(events.category, q.category));
  if (typeof q.minScore === "number") conds.push(gte(events.qualityScore, q.minScore));
  if (q.tags?.length) {
    // Array overlap: event carries ANY of the requested tags.
    conds.push(arrayOverlaps(events.tags, q.tags));
  }
  if (q.sourceTypes?.length) {
    // Scope to events whose main source's `source_type` matches one of the requested
    // facets (e.g. official/expert/kol). Unknown values were already stripped by
    // parseSourceTypes, so this is safe to bind directly.
    conds.push(inArray(sources.sourceType, q.sourceTypes));
  }
  if (q.sourceCategories?.length) {
    conds.push(arrayOverlaps(sources.categories, q.sourceCategories));
  }
  if (q.sourceIds?.length) {
    // Per-source facet (`sources=` param): events whose main source id matches.
    conds.push(inArray(events.mainSourceId, q.sourceIds));
  }
  if (q.contentTypes?.length) {
    conds.push(inArray(events.contentType, q.contentTypes));
  }
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(
      sql`(${events.title} ilike ${like} or ${events.summary} ilike ${like} or ${sources.name} ilike ${like} or exists (select 1 from unnest(${events.tags}) tag where tag ilike ${like}))`,
    );
  }
  if (q.cursor) {
    // Keyset: next page is rows ordered after the cursor under (sortKey desc, id desc).
    conds.push(sql`(${sortKey}, ${events.id}) < (${new Date(q.cursor.t)}, ${q.cursor.id})`);
  }

  const rows = (await db
    .select({
      id: events.id,
      title: events.title,
      summary: events.summary,
      detailedSummary: events.detailedSummary,
      recommendationReason: events.recommendationReason,
      category: events.category,
      contentType: events.contentType,
      tags: events.tags,
      qualityScore: events.qualityScore,
      viewCount: events.viewCount,
      selectedLevel: events.selectedLevel,
      selectedLabel: events.selectedLabel,
      publishedAt: events.publishedAt,
      promotedAt: events.promotedAt,
      createdAt: events.createdAt,
      media: events.media,
      sourceName: sources.name,
      authorName: posts.authorName,
      authorHandle: posts.authorHandle,
      url: posts.url,
      fullText: posts.fullText,
    })
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${sortKey} desc nulls last`, desc(events.id))
    .limit(q.take + 1)) as Row[];

  const hasMore = rows.length > q.take;
  const page = hasMore ? rows.slice(0, q.take) : rows;
  const items = page.map(toItem);

  let next_cursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]!;
    const t = q.mode === "selected" ? last.promotedAt : (last.publishedAt ?? last.createdAt);
    if (t) next_cursor = encodeCursor({ t: t.toISOString(), id: last.id });
  }

  return { items, next_cursor };
}
