// recompute-rank-scores (Slice 7; rank-v5 点6 切片C): re-applies the deterministic
// rank-score formula in bulk on persisted likeCount / starCount and the latest
// baseScore, plus the owner-annotation boost. The public down_count is intentionally NOT
// read here (v0.5 decision 2026-06-23): the public 👎 only collapses a card for that reader;
// the authoritative negative signal is the owner ✗没用 annotation, carried in owner_boost.
// Source of truth is src/scoring/rank-score.ts
// + src/scoring/owner-affinity.ts — this SQL is their in-database counterpart, kept
// structurally identical (same log-saturation, same band breakpoints, same additive boost,
// same direct/affinity owner boost) so the online and offline paths can never disagree.
//
// rank-v4: owner annotations are loaded first and aggregated in TS (buildAffinityProfile —
// the annotation set is tiny), then injected into the single UPDATE as two VALUES tables:
//   direct(event_id, boost)      — the event's own verdict (+useful / -not_useful)
//   aff(dim, key, affinity)      — per-dimension affinity for source/category/content_type/tag
// The SQL recomputes affinityBoost = clamp(max * mean(4 dims)) exactly like computeOwnerBoost.
//
// Runs on cron (every 15 minutes) so band transitions (0-6h → 6-24h → 24h-7d → 7d+) and
// drifting feedback counts gradually re-rank events without a write storm: a single
// UPDATE recomputes every event with a current_score_id in one pass.

import { eq, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, ownerAnnotations } from "@/db/schema";
import {
  buildAffinityProfile,
  type AffinityProfile,
  type AnnotatedEventDims,
} from "@/scoring/owner-affinity";
import { rankScoreConfig } from "@/scoring/rank-score";
import type { AnnotationVerdict } from "@/db/queries/owner-annotations";

export interface RecomputeRankScoresResult {
  /** Rows whose rank_score was updated (changed value). */
  updated: number;
  configVersion: string;
}

/** Loads event-annotation dims and aggregates the owner affinity profile (切片C/D shared). */
export async function loadOwnerAffinityProfile(
  db: DB = defaultDb,
): Promise<{ profile: AffinityProfile; directVerdicts: Map<string, AnnotationVerdict> }> {
  const rows = await db
    .select({
      verdict: ownerAnnotations.verdict,
      subjectId: ownerAnnotations.subjectId,
      sourceId: events.mainSourceId,
      category: events.category,
      contentType: events.contentType,
      tags: events.tags,
    })
    .from(ownerAnnotations)
    .innerJoin(events, eq(events.id, ownerAnnotations.subjectId))
    .where(eq(ownerAnnotations.subjectType, "event"));

  const dims: AnnotatedEventDims[] = rows.map((r) => ({
    verdict: r.verdict,
    sourceId: r.sourceId,
    category: r.category,
    contentType: r.contentType,
    tags: r.tags ?? [],
  }));
  const profile = buildAffinityProfile(dims, rankScoreConfig.owner.minSamples);
  const directVerdicts = new Map(rows.map((r) => [r.subjectId, r.verdict]));
  return { profile, directVerdicts };
}

/** VALUES rows for the affinity join. Sentinel row keeps the SQL valid when empty. */
function affinityValuesSql(profile: AffinityProfile): SQL {
  const rows: SQL[] = [sql`('', '', 0::float)`];
  const tables = [
    ["source", profile.source],
    ["category", profile.category],
    ["content_type", profile.contentType],
    ["tag", profile.tag],
  ] as const;
  for (const [dim, table] of tables) {
    for (const [key, entry] of table) {
      rows.push(sql`(${dim}, ${key}, ${entry.affinity}::float)`);
    }
  }
  return sql.join(rows, sql`, `);
}

/** VALUES rows for the direct-verdict join. Sentinel row keeps the SQL valid when empty. */
function directValuesSql(directVerdicts: Map<string, AnnotationVerdict>): SQL {
  const { usefulBoost, notUsefulPenalty } = rankScoreConfig.owner;
  const rows: SQL[] = [sql`('', 0::float)`];
  for (const [eventId, verdict] of directVerdicts) {
    const boost = verdict === "useful" ? usefulBoost : -notUsefulPenalty;
    rows.push(sql`(${eventId}, ${boost}::float)`);
  }
  return sql.join(rows, sql`, `);
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
  const viewSat = rankScoreConfig.viewSaturation;
  const viewBoost = rankScoreConfig.viewBoost;
  const affMax = rankScoreConfig.owner.affinityBoostMax;

  const { profile, directVerdicts } = await loadOwnerAffinityProfile(db);

  // age_hours = (now - coalesce(published_at, created_at)) in hours.
  // like_norm / star_norm = log1p saturation, clamped 0..1.
  // boosts picked by CASE on age_hours matching the band schedule.
  // owner_boost = direct verdict boost + clamp(affMax * mean(4 dim affinities), ±affMax)
  //   — structurally identical to computeOwnerBoost (missing key -> COALESCE 0).
  // new_rank = greatest(base + like + star + view + owner, 0). down_count is not read
  //   (public 👎 no longer penalizes rank; negative judgment flows via owner_boost).
  // WHERE filters: only events that already have a current_score_id (so we know which
  // event_scores row holds the deterministic base_score), and only update when the
  // value actually changes (cheap is-distinct-from check).
  const result = await db.execute(sql`
    WITH aff(dim, key, affinity) AS (
      VALUES ${affinityValuesSql(profile)}
    ),
    direct(event_id, boost) AS (
      VALUES ${directValuesSql(directVerdicts)}
    ),
    inputs AS (
      SELECT
        e.id AS event_id,
        s.base_score AS base_score,
        e.like_count AS like_count,
        e.star_count AS star_count,
        e.view_count AS view_count,
        EXTRACT(EPOCH FROM (${now}::timestamptz - COALESCE(e.published_at, e.created_at))) / 3600.0
          AS age_hours,
        COALESCE(d.boost, 0)
          + LEAST(GREATEST(
              ${affMax}::float * (
                COALESCE(a_src.affinity, 0) + COALESCE(a_cat.affinity, 0) + COALESCE(a_ct.affinity, 0) +
                COALESCE(a_tag.affinity, 0)
              ) / (3.0 + CASE WHEN COALESCE(a_tag.affinity, 0) = 0 THEN 0 ELSE 1 END),
              -${affMax}::float), ${affMax}::float)
          AS owner_boost
      FROM events e
      JOIN event_scores s ON s.id = e.current_score_id
      LEFT JOIN direct d ON d.event_id = e.id
      LEFT JOIN aff a_src ON a_src.dim = 'source' AND a_src.key = e.main_source_id
      LEFT JOIN aff a_cat ON a_cat.dim = 'category' AND a_cat.key = e.category
      LEFT JOIN aff a_ct ON a_ct.dim = 'content_type' AND a_ct.key = e.content_type::text
      LEFT JOIN LATERAL (
        SELECT affinity
        FROM aff
        WHERE dim = 'tag' AND key = ANY(e.tags)
        ORDER BY abs(affinity) DESC
        LIMIT 1
      ) a_tag ON true
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
              END
          + LEAST(GREATEST(LN(1 + view_count::float) / LN(1 + ${viewSat}::float), 0), 1)
            * ${viewBoost}::float
          + owner_boost,
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
