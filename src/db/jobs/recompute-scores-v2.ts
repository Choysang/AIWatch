// Recompute the scoring-v2 layers (SP4) for events in the candidacy window.
//
// scoring-v1's recompute (recompute-promotion-scores) derives promotion_score from base_score
// plus reader/expert signals. This v2 job re-derives the full layered model — event_quality,
// confidence (incl. multi-source corroboration), and selection — from the immutable judgment
// dimensions + source level + merged-post count + the same reader/expert signal bundle.
//
// Like the v1 recompute it appends one event_scores row per event (append-only history) and
// repoints events.current_score_id, carrying the v1 columns forward verbatim so the row stays
// a faithful snapshot. The row's scoring_config_version still stamps the v1 base_score; v2
// provenance (scoringV2Config.version) lives in `breakdown`. It also denormalizes the v2 hot
// fields (selection_score / confidence_score / selection_max_level) onto events, which the v2
// tournament (4.2b) reads.
//
// Events whose content_type is still NULL (legacy rows pending backfill-content-type) are
// skipped — the selection layer needs the classification multiplier. Run the content-type
// backfill first.

import { eq, inArray, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { eventJudgments, eventPosts, events, eventScores, sources } from "@/db/schema";
import { loadPromotionSignals } from "@/db/queries/promotion-signals";
import { composeScoresV2, type ComposeV2Breakdown } from "@/scoring/compose-v2";
import {
  scoringConfig,
  scoringV2Config,
  type ScoringConfig,
  type ScoringV2Config,
} from "@/scoring/config";
import type { ContentType } from "@/pipeline/judge-schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecomputeV2Result {
  /** Events within the widest candidacy window with a current score + judgment. */
  candidates: number;
  /** Rows appended to event_scores (v2 layers recomputed). */
  recomputed: number;
  /** Events skipped because content_type is not yet classified (backfill pending). */
  skipped: number;
}

export interface RecomputedV2Breakdown extends ComposeV2Breakdown {
  scoringConfigVersion: string;
  scoringV2Version: string;
  computedAt: string;
}

export async function recomputeScoresV2(
  now: Date = new Date(),
  db: DB = defaultDb,
  config: ScoringV2Config = scoringV2Config,
  v1Config: ScoringConfig = scoringConfig,
): Promise<RecomputeV2Result> {
  const p = v1Config.promotion;
  const maxWindowDays = Math.max(p.windowDays.B, p.windowDays.A, p.windowDays.S);
  const cutoff = new Date(now.getTime() - maxWindowDays * DAY_MS);

  const rows = await db
    .select({
      id: events.id,
      contentType: events.contentType,
      currentJudgmentId: events.currentJudgmentId,
      sourceLevel: sources.level,
      aiRelevance: eventJudgments.aiRelevance,
      impact: eventJudgments.impact,
      novelty: eventJudgments.novelty,
      audienceUsefulness: eventJudgments.audienceUsefulness,
      evidenceClarity: eventJudgments.evidenceClarity,
      // v1 columns carried forward verbatim (the row stays a faithful append-only snapshot).
      baseScore: eventScores.baseScore,
      qualityScoreV1: eventScores.qualityScore,
      promotionScore: eventScores.promotionScore,
      rankScore: eventScores.rankScore,
      displayScore: eventScores.displayScore,
      viewCount: events.viewCount,
    })
    .from(events)
    .innerJoin(eventScores, eq(eventScores.id, events.currentScoreId))
    .innerJoin(eventJudgments, eq(eventJudgments.id, events.currentJudgmentId))
    .innerJoin(sources, eq(sources.id, events.mainSourceId))
    .where(sql`coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff}`);

  if (rows.length === 0) return { candidates: 0, recomputed: 0, skipped: 0 };

  const ids = rows.map((r) => r.id);

  // Independent posts merged into each event drive multi-source corroboration in confidence.
  const countRows = await db
    .select({ eventId: eventPosts.eventId, n: sql<number>`count(*)::int` })
    .from(eventPosts)
    .where(inArray(eventPosts.eventId, ids))
    .groupBy(eventPosts.eventId);
  const postCount = new Map(countRows.map((r) => [r.eventId, r.n]));

  const bundles = await loadPromotionSignals(ids, db);

  let recomputed = 0;
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      if (!r.contentType) {
        skipped++;
        continue;
      }
      const judgmentId = r.currentJudgmentId;
      if (!judgmentId) {
        skipped++;
        continue;
      }
      const bundle = bundles.get(r.id) ?? {
        eventId: r.id,
        category: null,
        expertActions: [],
        validComments: [],
      };

      const v2 = composeScoresV2(
        {
          zeroGatePassed: true, // an existing event already passed the $0 gate at creation
          dimensions: {
            aiRelevance: r.aiRelevance,
            impact: r.impact,
            novelty: r.novelty,
            audienceUsefulness: r.audienceUsefulness,
            evidenceClarity: r.evidenceClarity,
          },
          sourceLevel: r.sourceLevel,
          sourcePostCount: postCount.get(r.id) ?? 1,
          expertActions: bundle.expertActions,
          validComments: bundle.validComments,
          viewCount: r.viewCount,
          contentType: r.contentType as ContentType,
        },
        config,
        v1Config,
      );

      const newScoreId = newId("es");
      const breakdown: RecomputedV2Breakdown = {
        ...v2.breakdown,
        scoringConfigVersion: v1Config.version,
        scoringV2Version: config.version,
        computedAt: now.toISOString(),
      };

      await tx.insert(eventScores).values({
        id: newScoreId,
        eventId: r.id,
        scoringConfigVersion: v1Config.version,
        judgmentId,
        baseScore: r.baseScore,
        qualityScore: r.qualityScoreV1,
        promotionScore: r.promotionScore,
        eventQualityScore: v2.qualityScore,
        confidenceScore: v2.confidenceScore,
        selectionScore: v2.selectionScore,
        selectionMaxLevel: v2.maxLevel,
        rankScore: r.rankScore,
        displayScore: r.displayScore,
        breakdown,
        computedAt: now,
      });

      await tx
        .update(events)
        .set({
          currentScoreId: newScoreId,
          selectionScore: v2.selectionScore,
          confidenceScore: v2.confidenceScore,
          selectionMaxLevel: v2.maxLevel,
          updatedAt: now,
        })
        .where(eq(events.id, r.id));

      recomputed++;
    }
  });

  return { candidates: rows.length, recomputed, skipped };
}
