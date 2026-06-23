// Deterministic rank-score: applies a time-banded user-feedback boost to the
// pure base_score. Pure function, no IO. The SQL job in db/jobs (Slice 7 task 21)
// applies the same formula in batch on persisted like/star counts.
//
// Spec: docs/superpowers/specs/2026-05-23-aiwatch-hot-design.md (User Feedback)
//   0-6h     external heat dominant (likes/stars small boost)
//   6-24h    external heat and user feedback close
//   24h-7d   user stars + expert value dominate
//   7d+      stars + expert + comments dominate
//
// Negative feedback (v0.5 decision, 2026-06-23): the PUBLIC 👎 "不感兴趣" reaction no
// longer lowers rank_score. It is gameable (any anonymous reader behind any NAT can
// push an event down) and noisy, so it is now a per-reader signal only — it collapses
// the card for that reader and nothing more. The authoritative negative signal is the
// owner/admin ✗没用 annotation, which flows in through `ownerBoost` (a −notUsefulPenalty
// direct hit plus dynamic per-source/category affinity; see owner-affinity.ts). down_count
// is still tracked on events, but it is intentionally NOT an input here.
//
// Boost is additive on top of base_score (which already includes externalHeat and
// expertValue components). A floor of 0 is enforced via `Math.max` only as a
// defensive guard — base_score is non-negative by construction.

import type { OwnerBoostConfig } from "./owner-affinity";

export interface RankScoreConfig {
  version: string;
  /** Count at which the like-normalized signal reaches ~98%. */
  likeSaturation: number;
  starSaturation: number;
  viewSaturation: number;
  /** Max points contributed by card/detail/source opens at saturation. */
  viewBoost: number;
  /** rank-v4 (点6 切片C): owner annotation boost weights (see owner-affinity.ts). */
  owner: OwnerBoostConfig;
  /** Time-banded boost weights. Bands are evaluated in order; the first whose
   *  `maxAgeHours` is strictly greater than `ageHours` wins. Last band must use
   *  `Infinity` to catch 7d+. */
  bands: ReadonlyArray<{
    label: string;
    maxAgeHours: number;
    /** Max points contributed by likes at saturation. */
    likeBoost: number;
    /** Max points contributed by stars at saturation. */
    starBoost: number;
  }>;
}

export const rankScoreConfig: RankScoreConfig = {
  version: "rank-v5",
  likeSaturation: 100,
  starSaturation: 20,
  viewSaturation: 200,
  viewBoost: 4,
  // 点6 设计锁定值：not_useful 直接压 20 分 ≈ 把误判资讯挤出首屏。
  owner: { usefulBoost: 12, notUsefulPenalty: 20, affinityBoostMax: 6, minSamples: 3 },
  bands: [
    // 0-6h: cold. External heat dominates base_score; user feedback is sparse.
    { label: "0-6h", maxAgeHours: 6, likeBoost: 2, starBoost: 3 },
    // 6-24h: warming. Heat and feedback move together.
    { label: "6-24h", maxAgeHours: 24, likeBoost: 6, starBoost: 6 },
    // 24h-7d: durable signal. Stars (intentional keep) outweighs likes.
    { label: "24h-7d", maxAgeHours: 24 * 7, likeBoost: 4, starBoost: 10 },
    // 7d+: archive. Likes fade, stars persist as the durable curation signal.
    { label: "7d+", maxAgeHours: Number.POSITIVE_INFINITY, likeBoost: 1, starBoost: 12 },
  ],
};

export interface RankScoreInputs {
  baseScore: number;
  /** Non-negative integer. */
  likeCount: number;
  /** Non-negative integer. */
  starCount: number;
  /** Non-negative integer. */
  viewCount?: number;
  /** Hours since event.publishedAt. Negative inputs are treated as 0. */
  ageHours: number;
  /** rank-v4: precomputed owner boost (directBoost + affinityBoost from owner-affinity.ts).
   *  Already bounded by config; may be negative. Defaults to 0 (no annotations). */
  ownerBoost?: number;
}

export interface RankScoreBreakdown {
  configVersion: string;
  baseScore: number;
  bandLabel: string;
  likeBoost: number;
  starBoost: number;
  viewBoost: number;
  ownerBoost: number;
  rankScore: number;
}

export interface RankScoreResult {
  rankScore: number;
  breakdown: RankScoreBreakdown;
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Log saturation: 0 -> 0, saturation -> 1. Monotone increasing. */
function saturate(count: number, saturation: number): number {
  if (count <= 0 || saturation <= 0) return 0;
  return clamp01(Math.log1p(count) / Math.log1p(saturation));
}

function pickBand(ageHours: number, config: RankScoreConfig): RankScoreConfig["bands"][number] {
  const age = Math.max(0, ageHours);
  for (const band of config.bands) {
    if (age < band.maxAgeHours) return band;
  }
  // Defensive: last band must be Infinity; if config is malformed, fall back.
  return config.bands[config.bands.length - 1]!;
}

export function computeRankScore(
  inputs: RankScoreInputs,
  config: RankScoreConfig = rankScoreConfig,
): RankScoreResult {
  const band = pickBand(inputs.ageHours, config);
  const likeNorm = saturate(inputs.likeCount, config.likeSaturation);
  const starNorm = saturate(inputs.starCount, config.starSaturation);
  const viewNorm = saturate(inputs.viewCount ?? 0, config.viewSaturation);
  const likeBoost = likeNorm * band.likeBoost;
  const starBoost = starNorm * band.starBoost;
  const viewBoost = viewNorm * config.viewBoost;
  const ownerBoost = inputs.ownerBoost ?? 0;
  const rankScore = Math.max(0, inputs.baseScore + likeBoost + starBoost + viewBoost + ownerBoost);
  return {
    rankScore,
    breakdown: {
      configVersion: config.version,
      baseScore: inputs.baseScore,
      bandLabel: band.label,
      likeBoost,
      starBoost,
      viewBoost,
      ownerBoost,
      rankScore,
    },
  };
}

/** Helper for SQL job parity: name + numeric boost weights for the current band. */
export function bandWeightsForAge(
  ageHours: number,
  config: RankScoreConfig = rankScoreConfig,
): { label: string; likeBoost: number; starBoost: number } {
  const band = pickBand(ageHours, config);
  return {
    label: band.label,
    likeBoost: band.likeBoost,
    starBoost: band.starBoost,
  };
}
