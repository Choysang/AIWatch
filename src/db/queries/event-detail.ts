// Event detail query (Slice 10). Fetches a single event with the same shape used by
// the feed card, plus extra fields the detail page wants (canonical URL, full tag
// list, source URL). Returns null when the event doesn't exist so the route can hand
// off to Next's notFound() instead of throwing.

import { desc, eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import type { EventCard } from "@/db/queries/feed";
import { eventPosts, events, posts, sources } from "@/db/schema";

export interface EventDetail extends EventCard {
  sourceUrl: string | null;
  /** Original post body (untranslated). Shown collapsed on the detail page so readers
   *  who can't open x.com still get the full source text. */
  rawContent: string | null;
}

export async function getEventDetail(
  eventId: string,
  db: DB = defaultDb,
): Promise<EventDetail | null> {
  const rows = await db
    .select({
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
      rawContent: posts.rawContent,
      likeCount: events.likeCount,
      starCount: events.starCount,
      downCount: events.downCount,
      viewCount: events.viewCount,
    })
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .where(eq(events.id, eventId))
    .limit(1);
  return (rows[0] as EventDetail | undefined) ?? null;
}
export interface EventSourcePerspective {
  postId: string;
  sourceName: string | null;
  sourceType: string | null;
  platform: string;
  authorName: string | null;
  authorHandle: string | null;
  url: string | null;
  title: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
}

function excerpt(raw: string | null, max = 180): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

export async function listEventSourcePerspectives(
  eventId: string,
  db: DB = defaultDb,
): Promise<EventSourcePerspective[]> {
  const rows = await db
    .select({
      postId: posts.id,
      sourceName: sources.name,
      sourceType: sources.sourceType,
      platform: posts.platform,
      authorName: posts.authorName,
      authorHandle: posts.authorHandle,
      url: posts.url,
      rawTitle: posts.rawTitle,
      displayTitle: posts.displayTitle,
      rawContent: posts.rawContent,
      publishedAt: posts.publishedAt,
    })
    .from(eventPosts)
    .innerJoin(posts, eq(posts.id, eventPosts.postId))
    .leftJoin(sources, eq(sources.id, posts.sourceId))
    .where(eq(eventPosts.eventId, eventId))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(12);

  return rows.map((row) => ({
    postId: row.postId,
    sourceName: row.sourceName,
    sourceType: row.sourceType,
    platform: row.platform,
    authorName: row.authorName,
    authorHandle: row.authorHandle,
    url: row.url,
    title: row.displayTitle ?? row.rawTitle,
    excerpt: excerpt(row.rawContent),
    publishedAt: row.publishedAt,
  }));
}