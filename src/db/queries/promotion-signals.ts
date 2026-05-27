// Promotion signal loader (Scoring Integrity slice).
//
// Builds the per-event signal bundle needed to compute promotion_score:
//   - expert actions: event_reactions × user, restricted to roles that count
//     (expert/moderator/admin/owner), carrying expertWeight + domain match against the
//     event's category.
//   - valid comments: event_comments where classification = 'valid', carrying category +
//     isExpert. Low-value comments are filtered out (they don't surface to readers, so
//     they don't influence the score either).
//   - category: events.category (used for domain match).
//
// Returns one bundle per event id in the input; missing event ids are omitted.
//
// V1 doesn't model citations between events — citation_quality_score falls back to its
// neutral baseline in computeCitationQualityScore. This loader stays neutral on citations
// so the call sites don't need to know.
//
// One join-aware select per signal type keeps the query count flat regardless of input
// length; the events.id IN (...) filter is satisfied by primary-key index lookups.

import { and, eq, inArray } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { eventComments, eventReactions, events, user as userTable } from "@/db/schema";
import type { ExpertAction } from "@/scoring/expert-value";
import type { ValidComment } from "@/scoring/comment-quality";
import type { CommentCategory } from "@/comments/classifier";

export interface PromotionSignalBundle {
  eventId: string;
  category: string | null;
  expertActions: ExpertAction[];
  validComments: ValidComment[];
}

const EXPERT_ROLES = ["expert", "moderator", "admin", "owner"] as const;

function domainMatches(domains: readonly string[], category: string | null): boolean {
  if (!category) return false;
  const cat = category.trim().toLowerCase();
  if (cat.length === 0) return false;
  return domains.some((d) => d.trim().toLowerCase() === cat);
}

/** Load the promotion signals for a batch of events. Returns a map keyed by event id. */
export async function loadPromotionSignals(
  eventIds: readonly string[],
  db: DB = defaultDb,
): Promise<Map<string, PromotionSignalBundle>> {
  const out = new Map<string, PromotionSignalBundle>();
  if (eventIds.length === 0) return out;

  // Pre-seed the bundle from events (so categories are known even when there are no
  // reactions/comments yet).
  const eventRows = await db
    .select({ id: events.id, category: events.category })
    .from(events)
    .where(inArray(events.id, eventIds as string[]));
  const categoryById = new Map<string, string | null>();
  for (const r of eventRows) {
    categoryById.set(r.id, r.category);
    out.set(r.id, {
      eventId: r.id,
      category: r.category,
      expertActions: [],
      validComments: [],
    });
  }

  // Expert reactions: join event_reactions × user, filter by role. fingerprint-only rows
  // (anonymous) skip the join and don't count — only certified accounts contribute to
  // expert_value_score per spec § Scoring.
  const reactionRows = await db
    .select({
      eventId: eventReactions.eventId,
      kind: eventReactions.kind,
      role: userTable.role,
      expertWeight: userTable.expertWeight,
      expertDomain: userTable.expertDomain,
    })
    .from(eventReactions)
    .innerJoin(userTable, eq(userTable.id, eventReactions.userId))
    .where(
      and(
        inArray(eventReactions.eventId, eventIds as string[]),
        inArray(userTable.role, EXPERT_ROLES as unknown as string[]),
      ),
    );
  for (const r of reactionRows) {
    const bundle = out.get(r.eventId);
    if (!bundle) continue;
    bundle.expertActions.push({
      kind: r.kind,
      role: r.role,
      expertWeight: r.expertWeight,
      domainMatch: domainMatches(r.expertDomain ?? [], categoryById.get(r.eventId) ?? null),
    });
  }

  // Valid comments only — low-value rows are stored but never surface.
  const commentRows = await db
    .select({
      eventId: eventComments.eventId,
      category: eventComments.category,
      isExpert: eventComments.isExpert,
    })
    .from(eventComments)
    .where(
      and(
        inArray(eventComments.eventId, eventIds as string[]),
        eq(eventComments.classification, "valid"),
      ),
    );
  for (const r of commentRows) {
    const bundle = out.get(r.eventId);
    if (!bundle) continue;
    bundle.validComments.push({
      category: r.category as CommentCategory,
      isExpert: r.isExpert,
    });
  }

  return out;
}
