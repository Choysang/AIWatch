// recompute-rank-scores (Slice 7): re-applies the deterministic rank-score formula in
// bulk on persisted likeCount / starCount and the latest baseScore. Source of truth is
// src/scoring/rank-score.ts — this SQL is its in-database counterpart, kept structurally
// identical (same log-saturation, same band breakpoints, same additive boost) so the
// online and offline paths can never disagree.
//
// Runs on cron (every 15 minutes) so band transitions (0-6h → 6-24h → 24h-7d → 7d+) and
// drifting feedback counts gradually re-rank events without a write storm: a single
// UPDATE recomputes every event with a current_score_id in one pass.

import { sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { rankScoreConfig } from "@/scoring/rank-score";

export interface RecomputeRankScoresResult {
  /** Rows whose rank_score was updated (changed value). */
  updated: number;
  configVersion: string;
}

export async function recomputeRankScores(
  now: Date = new Date(),
  db: DB = defaultDb,
): Promise<RecomputeRankScoresResult> {
  // Hard-bind config values into the SQL so parity is auditable. If the bands ever
  // change, the test in src/scoring/rank-score.test.ts and this job ship together in
  // the same PR (deterministic-scoring philosophy).
  const [b0, b1, b2, b3] = rankScoreConfig.bands;
  if (!b0 || !b1 || !b2 || !b3) {
    throw new Error("rankScoreConfig.bands malformed (expected 4 bands)");
  }
  const likeSat = rankScoreConfig.likeSaturation;
  const starSat = rankScoreConfig.starSaturation;

  // age_hours = (now - coalesce(published_at, created_at)) in hours.
  // like_norm / star_norm = log1p saturation, clamped 0..1.
  // boosts picked by CASE on age_hours matching the band schedule.
  // new_rank = greatest(base + like_norm*lb + star_norm*sb, 0).
  // WHERE filters: only events that already have a current_score_id (so we know which
  // event_scores row holds the deterministic base_score), and only update when the
  // value actually changes (cheap is-distinct-from check).
  const result = await db.execute(sql`
    WITH inputs AS (
      SELECT
        e.id AS event_id,
        s.base_score AS base_score,
        e.like_count AS like_count,
        e.star_count AS star_count,
        EXTRACT(EPOCH FROM (${now}::timestamptz - COALESCE(e.published_at, e.created_at))) / 3600.0
          AS age_hours
      FROM events e
      JOIN event_scores s ON s.id = e.current_score_id
    ),
    scored AS (
      SELECT
        event_id,
        GREATEST(
          base_score
          + LEAST(GREATEST(LN(1 + like_count::float) / LN(1 + ${likeSat}::float), 0), 1)
            * CASE
                WHEN age_hours < ${b0.maxAgeHours} THEN ${b0.likeBoost}::float
                WHEN age_hours < ${b1.maxAgeHours} THEN ${b1.likeBoost}::float
                WHEN age_hours < ${b2.maxAgeHours} THEN ${b2.likeBoost}::float
                ELSE ${b3.likeBoost}::float
              END
          + LEAST(GREATEST(LN(1 + star_count::float) / LN(1 + ${starSat}::float), 0), 1)
            * CASE
                WHEN age_hours < ${b0.maxAgeHours} THEN ${b0.starBoost}::float
                WHEN age_hours < ${b1.maxAgeHours} THEN ${b1.starBoost}::float
                WHEN age_hours < ${b2.maxAgeHours} THEN ${b2.starBoost}::float
                ELSE ${b3.starBoost}::float
              END,
          0
        ) AS new_rank
      FROM inputs
    )
    UPDATE events e
    SET rank_score = scored.new_rank,
        updated_at = ${now}
    FROM scored
    WHERE e.id = scored.event_id
      AND e.rank_score IS DISTINCT FROM scored.new_rank
  `);

  // node-postgres returns rowCount on the underlying result. Drizzle's execute() wraps
  // QueryResult; rowCount may be number or null.
  const updated =
    (result as unknown as { rowCount?: number | null }).rowCount ?? 0;
  return { updated, configVersion: rankScoreConfig.version };
}
