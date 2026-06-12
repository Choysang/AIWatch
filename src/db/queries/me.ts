import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { eventComments, eventReactions, events, posts, sources } from "@/db/schema";
import { cardColumns, type EventCard } from "@/db/queries/feed";
import type { ReactionKind } from "@/db/queries/reactions";

export interface MyCommentItem {
  id: string;
  eventId: string;
  eventTitle: string;
  sourceName: string | null;
  body: string;
  category: string;
  classification: string;
  likeCount: number;
  createdAt: Date;
}

export async function listMyReactionEvents(
  userId: string,
  kind: ReactionKind,
  limit = 50,
  db: DB = defaultDb,
): Promise<EventCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(eventReactions)
    .innerJoin(events, eq(events.id, eventReactions.eventId))
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .where(and(eq(eventReactions.userId, userId), eq(eventReactions.kind, kind)))
    .orderBy(desc(eventReactions.createdAt), desc(eventReactions.id))
    .limit(limit);
  return rows as EventCard[];
}

export async function listMyComments(
  userId: string,
  limit = 50,
  db: DB = defaultDb,
): Promise<MyCommentItem[]> {
  const rows = await db
    .select({
      id: eventComments.id,
      eventId: eventComments.eventId,
      eventTitle: events.title,
      sourceName: sources.name,
      body: eventComments.body,
      category: eventComments.category,
      classification: eventComments.classification,
      likeCount: eventComments.likeCount,
      createdAt: eventComments.createdAt,
    })
    .from(eventComments)
    .innerJoin(events, eq(events.id, eventComments.eventId))
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .where(eq(eventComments.userId, userId))
    .orderBy(desc(eventComments.createdAt), desc(eventComments.id))
    .limit(limit);
  return rows as MyCommentItem[];
}
