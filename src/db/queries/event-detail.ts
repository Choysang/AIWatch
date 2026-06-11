// Event detail query (Slice 10). Fetches a single event with the same shape used by
// the feed card, plus extra fields the detail page wants (canonical URL, full tag
// list, source URL). Returns null when the event doesn't exist so the route can hand
// off to Next's notFound() instead of throwing.

import { eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import type { EventCard } from "@/db/queries/feed";
import { events, posts, sources } from "@/db/schema";

export interface EventDetail extends EventCard {
  sourceUrl: string | null;
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
