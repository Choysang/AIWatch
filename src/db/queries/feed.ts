// Reader feed query: recent events joined with their main source and main post,
// shaped for the event card. Read path for the homepage and (later) /api/public/items.

import { desc, eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, sources } from "@/db/schema";

export interface EventCard {
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
  sourceName: string | null;
  sourcePlatform: string | null;
  authorName: string | null;
  authorHandle: string | null;
  url: string | null;
  media: unknown;
}

/** Most recent events first (All AI Dynamics default sort). */
export async function listRecentEvents(limit = 30, db: DB = defaultDb): Promise<EventCard[]> {
  const rows = await db
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
      media: events.media,
      sourceName: sources.name,
      sourcePlatform: sources.platform,
      authorName: posts.authorName,
      authorHandle: posts.authorHandle,
      url: posts.url,
    })
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .orderBy(desc(events.publishedAt), desc(events.createdAt))
    .limit(limit);
  return rows as EventCard[];
}
