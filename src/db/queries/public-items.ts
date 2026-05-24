// Public items query (decision 13): cursor (keyset) pagination, hard page caps, no bulk
// export. Powers GET /api/public/items in both `selected` and `all` modes. Search is
// server-side (decision: agents must not fetch-and-grep); Slice 2 uses ILIKE, FTS later.

import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, sources } from "@/db/schema";
import type { PublicItem, PublicItemsResponse } from "@/public/item";
import { encodeCursor, windowStart, type PublicQuery } from "@/public/query";

interface Row {
  id: string;
  title: string;
  summary: string | null;
  recommendationReason: string | null;
  category: string | null;
  tags: string[];
  qualityScore: number | null;
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
}

function toItem(r: Row): PublicItem {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    source_name: r.sourceName,
    author_name: r.authorName,
    author_handle: r.authorHandle,
    summary: r.summary,
    recommendation_reason: r.recommendationReason,
    quality_score: r.qualityScore,
    selected_level: r.selectedLevel,
    selected_label: r.selectedLabel,
    category: r.category,
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
  const start = windowStart(q.since, now);
  if (start) conds.push(sql`${sortKey} >= ${start}`);
  if (q.category) conds.push(eq(events.category, q.category));
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
      recommendationReason: events.recommendationReason,
      category: events.category,
      tags: events.tags,
      qualityScore: events.qualityScore,
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
