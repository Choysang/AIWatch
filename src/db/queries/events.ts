// Event resolution + creation. event_judgments and event_scores are append-only;
// the event row carries current_* pointers plus denormalized hot fields for fast reads.
// Creating an event writes judgment + score + membership + pointers in one transaction.

import { and, eq, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { eventJudgments, eventPosts, events, eventScores, posts } from "@/db/schema";
import type { ColdJudge } from "@/pipeline/judge-schema";
import type { PromotedLevel, ScoreBreakdown, SourceLevel } from "@/scoring/types";

/** Find an event already holding a post with this canonical URL (same-event merge). */
export async function findEventIdByCanonicalUrl(
  canonicalUrl: string,
  db: DB = defaultDb,
): Promise<string | null> {
  const rows = await db
    .select({ eventId: eventPosts.eventId })
    .from(eventPosts)
    .innerJoin(posts, eq(posts.id, eventPosts.postId))
    .where(eq(posts.canonicalUrl, canonicalUrl))
    .limit(1);
  return rows[0]?.eventId ?? null;
}

export async function attachPostToEvent(
  eventId: string,
  postId: string,
  relation: "same_event" | "related" = "same_event",
  db: DB = defaultDb,
): Promise<void> {
  await db
    .insert(eventPosts)
    .values({ eventId, postId, relation })
    .onConflictDoNothing();
}

export interface CreateEventInput {
  source: { id: string; level: SourceLevel };
  // media is denormalized onto the event (events holds the hot read fields the card needs):
  // the reader feed selects events.media, so the post's extracted image must ride along here
  // or it never reaches the card.
  post: { id: string; publishedAt: Date | null; media?: unknown };
  judgment: ColdJudge;
  routing: {
    provider: string;
    modelId: string;
    promptVersion: string;
    routingConfigVersion: string;
  };
  scoring: {
    configVersion: string;
    baseScore: number;
    qualityScore: number;
    rankScore: number;
    displayScore: number;
    breakdown: ScoreBreakdown;
  };
  /** scoring-v2 layers (SP4). Optional so legacy/test callers stay valid; when present the new
   *  event_scores columns + denormalized events fields are written. */
  scoringV2?: {
    eventQualityScore: number;
    confidenceScore: number;
    selectionScore: number;
    selectionMaxLevel: PromotedLevel;
  };
}

/** Create a fresh event from a post, with its first judgment + score, atomically. */
export async function createEventFromPost(
  input: CreateEventInput,
  db: DB = defaultDb,
): Promise<string> {
  const eventId = newId("evt");
  const judgmentId = newId("ej");
  const scoreId = newId("es");
  const { judgment, scoring } = input;

  await db.transaction(async (tx) => {
    await tx.insert(events).values({
      id: eventId,
      title: judgment.summary.slice(0, 200),
      summary: judgment.summary,
      recommendationReason: judgment.recommendationReason,
      category: judgment.category,
      contentType: judgment.contentType,
      tags: judgment.tags,
      mainSourceId: input.source.id,
      mainPostId: input.post.id,
      media: input.post.media ?? null,
      qualityScore: Math.round(scoring.qualityScore),
      rankScore: scoring.rankScore,
      selectionScore: input.scoringV2?.selectionScore ?? null,
      confidenceScore: input.scoringV2?.confidenceScore ?? null,
      selectionMaxLevel: input.scoringV2?.selectionMaxLevel ?? null,
      publishedAt: input.post.publishedAt,
      lastStrongSignalAt: input.post.publishedAt,
    });

    await tx.insert(eventJudgments).values({
      id: judgmentId,
      eventId,
      provider: input.routing.provider,
      modelId: input.routing.modelId,
      promptVersion: input.routing.promptVersion,
      routingConfigVersion: input.routing.routingConfigVersion,
      triggerReason: "initial",
      triggerPostId: input.post.id,
      aiRelevance: judgment.aiRelevance,
      impact: judgment.impact,
      novelty: judgment.novelty,
      audienceUsefulness: judgment.audienceUsefulness,
      evidenceClarity: judgment.evidenceClarity,
      summary: judgment.summary,
      category: judgment.category,
      contentType: judgment.contentType,
      tags: judgment.tags,
      recommendationReason: judgment.recommendationReason,
    });

    await tx.insert(eventScores).values({
      id: scoreId,
      eventId,
      scoringConfigVersion: scoring.configVersion,
      judgmentId,
      baseScore: scoring.baseScore,
      qualityScore: scoring.qualityScore,
      eventQualityScore: input.scoringV2?.eventQualityScore ?? null,
      confidenceScore: input.scoringV2?.confidenceScore ?? null,
      selectionScore: input.scoringV2?.selectionScore ?? null,
      selectionMaxLevel: input.scoringV2?.selectionMaxLevel ?? null,
      rankScore: scoring.rankScore,
      displayScore: scoring.displayScore,
      breakdown: scoring.breakdown,
    });

    await tx.insert(eventPosts).values({
      eventId,
      postId: input.post.id,
      relation: "same_event",
    });

    // Title from the post's display title is preferred when available; fall back kept above.
    await tx
      .update(events)
      .set({
        currentJudgmentId: judgmentId,
        currentScoreId: scoreId,
        title: sql`coalesce((select ${posts.displayTitle} from ${posts} where ${posts.id} = ${input.post.id}), ${events.title})`,
        updatedAt: sql`now()`,
      })
      .where(eq(events.id, eventId));
  });

  return eventId;
}

/** Whether a post is already attached to any event (idempotency guard). */
export async function postHasEvent(postId: string, db: DB = defaultDb): Promise<boolean> {
  const rows = await db
    .select({ eventId: eventPosts.eventId })
    .from(eventPosts)
    .where(eq(eventPosts.postId, postId))
    .limit(1);
  return rows.length > 0;
}
