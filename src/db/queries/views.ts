import { eq, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { eventViews, events } from "@/db/schema";
import { EventNotFoundError, ReactionIdentityError, type ReactionIdentity } from "./reactions";

export interface ViewCount {
  eventId: string;
  viewCount: number;
}

export interface ViewCountResult extends ViewCount {
  counted: boolean;
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

function assertIdentity(identity: ReactionIdentity): void {
  const hasUser = identity.userId !== null && identity.userId !== "";
  const hasFp = identity.fingerprint !== null && identity.fingerprint !== "";
  if (hasUser === hasFp) {
    throw new ReactionIdentityError("exactly one of userId/fingerprint must be set");
  }
}

export async function recordEventView(
  args: {
    eventId: string;
    identity: ReactionIdentity;
  },
  db: DB = defaultDb,
): Promise<ViewCountResult> {
  assertIdentity(args.identity);
  return db.transaction(async (tx) => {
    await readViewCount(tx, args.eventId);

    const inserted = await tx
      .insert(eventViews)
      .values({
        id: newId("evv"),
        eventId: args.eventId,
        userId: args.identity.userId,
        fingerprint: args.identity.fingerprint,
      })
      .onConflictDoNothing()
      .returning({ id: eventViews.id });

    if (inserted.length === 0) {
      const count = await readViewCount(tx, args.eventId);
      return { ...count, counted: false };
    }

    const rows = await tx
      .update(events)
      .set({ viewCount: sql`${events.viewCount} + 1`, updatedAt: new Date() })
      .where(eq(events.id, args.eventId))
      .returning({ id: events.id, viewCount: events.viewCount });
    const row = rows[0];
    if (!row) throw new EventNotFoundError(args.eventId);
    return { eventId: row.id, viewCount: row.viewCount, counted: true };
  });
}

export async function getEventViewCount(
  eventId: string,
  db: DB = defaultDb,
): Promise<ViewCount> {
  return readViewCount(db, eventId);
}
