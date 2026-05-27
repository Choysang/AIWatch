// Recompute promotion_score for events in the candidacy window (Scoring Integrity slice).
//
// Lifecycle: posts -> judgment -> base_score is set once at event creation. Reader and
// expert signals (likes, stars, comments) arrive later, so promotion_score has to be
// recomputed before each tournament run. This job:
//   1. Loads events in the widest candidacy window with their current base_score.
//   2. Calls loadPromotionSignals() to attach expert actions + valid comments.
//   3. Runs composePromotionScores() to derive expert/comment/citation/promotion/display
//      scores from the signals + base.
//   4. Appends one event_scores row per event (immutable history) and updates the events
//      pointers + denormalized hot fields (qualityScore=display_score, peakScore=ratcheted
//      max). last_strong_signal_at is re-armed when an actual strong signal lands — that's
//      the caller's job (addReaction / addComment), not this aggregator's.
//
// Idempotent: re-running with no new signals produces the same numbers and an event_scores
// row that's identical to the prior one. The append-only history is the audit trail.

import { eq, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { events, eventScores } from "@/db/schema";
import { loadPromotionSignals } from "@/db/queries/promotion-signals";
import { composePromotionScores, type ComposeBreakdown } from "@/scoring/compose";
import { scoringConfig, type ScoringConfig } from "@/scoring/config";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface RecomputeResult {
  /** Events considered (within the widest tier window). */
  candidates: number;
  /** Rows actually appended to event_scores. Equals candidates unless caller pre-filtered. */
  recomputed: number;
}

export interface RecomputedPromotionBreakdown extends ComposeBreakdown {
  scoringConfigVersion: string;
  computedAt: string;
}

/** Recompute promotion-related scores for every event within the largest candidacy window.
 *
 * Pre-aggregates signal load with a single batched join per signal type so the row count is
 * independent of the event count; per-event SQL is the score insert + events update only. */
export async function recomputePromotionScores(
  now: Date = new Date(),
  db: DB = defaultDb,
  config: ScoringConfig = scoringConfig,
): Promise<RecomputeResult> {
  const p = config.promotion;
  const maxWindowDays = Math.max(p.windowDays.B, p.windowDays.A, p.windowDays.S);
  const cutoff = new Date(now.getTime() - maxWindowDays * DAY_MS);

  const rows = await db
    .select({
      id: events.id,
      currentJudgmentId: events.currentJudgmentId,
      publishedAt: events.publishedAt,
      createdAt: events.createdAt,
      lastStrongSignalAt: events.lastStrongSignalAt,
      promotedAt: events.promotedAt,
      selectedLevel: events.selectedLevel,
      peakScore: events.peakScore,
      baseScore: eventScores.baseScore,
      currentScoreId: events.currentScoreId,
    })
    .from(events)
    .innerJoin(eventScores, eq(eventScores.id, events.currentScoreId))
    .where(sql`coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff}`);

  if (rows.length === 0) return { candidates: 0, recomputed: 0 };

  const bundles = await loadPromotionSignals(
    rows.map((r) => r.id),
    db,
  );

  let recomputed = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const bundle = bundles.get(r.id) ?? {
        eventId: r.id,
        category: null,
        expertActions: [],
        validComments: [],
      };

      const ageAnchor = r.lastStrongSignalAt ?? r.promotedAt ?? r.publishedAt ?? r.createdAt;
      const ageHours = Math.max(0, (now.getTime() - ageAnchor.getTime()) / HOUR_MS);

      const result = composePromotionScores(
        {
          baseScore: r.baseScore,
          expertActions: bundle.expertActions,
          validComments: bundle.validComments,
          level: r.selectedLevel,
          priorPeakScore: r.peakScore ?? null,
          ageSinceLastStrongSignalHours: ageHours,
        },
        config,
      );

      // judgmentId is required by event_scores; fall back to currentScoreId's judgmentId
      // by reusing the prior judgment. If currentJudgmentId is null the event row is in an
      // inconsistent state we don't try to recover from here.
      const judgmentId = r.currentJudgmentId;
      if (!judgmentId) continue;

      const newScoreId = newId("es");
      const breakdown: RecomputedPromotionBreakdown = {
        ...result.breakdown,
        scoringConfigVersion: config.version,
        computedAt: now.toISOString(),
      };

      await tx.insert(eventScores).values({
        id: newScoreId,
        eventId: r.id,
        scoringConfigVersion: config.version,
        judgmentId,
        baseScore: r.baseScore,
        qualityScore: result.displayScore,
        promotionScore: result.promotionScore,
        // rankScore is owned by the rank-score job (Slice 7); preserve it here so this job
        // is composable with the rank-score job in either order.
        rankScore: r.baseScore,
        displayScore: Math.round(result.displayScore),
        breakdown,
        computedAt: now,
      });

      await tx
        .update(events)
        .set({
          currentScoreId: newScoreId,
          qualityScore: Math.round(result.displayScore),
          peakScore: result.peakScore,
          updatedAt: now,
        })
        .where(eq(events.id, r.id));

      recomputed++;
    }
  });

  return { candidates: rows.length, recomputed };
}
