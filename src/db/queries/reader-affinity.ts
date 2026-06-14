// Reader signal loader for personalization (v0.5 A3). Reads one reader's reactions
// (like/star/down) + views, joined to each event's ranking dimensions, into the flat
// ReaderSignal[] the affinity model aggregates. Identity is XOR (userId | fingerprint),
// same as event_reactions. Bounded per request (a very active reader is capped).

import { and, eq, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { eventReactions, events, eventViews } from "@/db/schema";
import type { ReaderIdentity } from "@/db/queries/topic-boards";
import type { ReaderSignal } from "@/scoring/reader-affinity";

export interface ReaderSignalsResult {
  signals: ReaderSignal[];
  /** Events the reader explicitly downed — excluded entirely from personalized results (P6). */
  downedEventIds: string[];
}

const DEFAULT_SIGNAL_LIMIT = 500;

function reactionIdentityWhere(identity: ReaderIdentity): SQL | undefined {
  if (identity.userId) return eq(eventReactions.userId, identity.userId);
  if (identity.fingerprint) return eq(eventReactions.fingerprint, identity.fingerprint);
  return undefined;
}

function viewIdentityWhere(identity: ReaderIdentity): SQL | undefined {
  if (identity.userId) return eq(eventViews.userId, identity.userId);
  if (identity.fingerprint) return eq(eventViews.fingerprint, identity.fingerprint);
  return undefined;
}

/** Load a reader's weighted signals + their downed event ids. Empty for an unknown identity. */
export async function loadReaderSignals(
  identity: ReaderIdentity,
  db: DB = defaultDb,
  limit = DEFAULT_SIGNAL_LIMIT,
): Promise<ReaderSignalsResult> {
  const reactionWhere = reactionIdentityWhere(identity);
  const viewWhere = viewIdentityWhere(identity);
  if (!reactionWhere || !viewWhere) return { signals: [], downedEventIds: [] };

  const dims = {
    tags: events.tags,
    sourceId: events.mainSourceId,
    category: events.category,
    contentType: events.contentType,
  };

  const reactionRows = await db
    .select({ kind: eventReactions.kind, eventId: eventReactions.eventId, ...dims })
    .from(eventReactions)
    .innerJoin(events, eq(events.id, eventReactions.eventId))
    .where(and(reactionWhere))
    .limit(limit);

  const viewRows = await db
    .select({ eventId: eventViews.eventId, ...dims })
    .from(eventViews)
    .innerJoin(events, eq(events.id, eventViews.eventId))
    .where(and(viewWhere))
    .limit(limit);

  const signals: ReaderSignal[] = [];
  const downedEventIds: string[] = [];
  for (const r of reactionRows) {
    signals.push({
      signal: r.kind,
      tags: r.tags ?? [],
      sourceId: r.sourceId,
      category: r.category,
      contentType: r.contentType,
    });
    if (r.kind === "down") downedEventIds.push(r.eventId);
  }
  for (const v of viewRows) {
    signals.push({
      signal: "view",
      tags: v.tags ?? [],
      sourceId: v.sourceId,
      category: v.category,
      contentType: v.contentType,
    });
  }
  return { signals, downedEventIds };
}
