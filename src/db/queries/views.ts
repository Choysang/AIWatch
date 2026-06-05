import { eq, sql } from "drizzle-orm";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { events } from "@/db/schema";
import { EventNotFoundError } from "./reactions";

export interface ViewCount {
  eventId: string;
  viewCount: number;
}

async function readViewCount(db: DB | Tx, eventId: string): Promise<ViewCount> {
  const rows = await db
    .select({ id: events.id, viewCount: events.viewCount })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new EventNotFoundError(eventId);
  return { eventId: row.id, viewCount: row.viewCount };
}

export async function incrementEventView(
  eventId: string,
  db: DB = defaultDb,
): Promise<ViewCount> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(events)
      .set({ viewCount: sql`${events.viewCount} + 1`, updatedAt: new Date() })
      .where(eq(events.id, eventId))
      .returning({ id: events.id, viewCount: events.viewCount });
    const row = rows[0];
    if (!row) throw new EventNotFoundError(eventId);
    return { eventId: row.id, viewCount: row.viewCount };
  });
}

export async function getEventViewCount(
  eventId: string,
  db: DB = defaultDb,
): Promise<ViewCount> {
  return readViewCount(db, eventId);
}
