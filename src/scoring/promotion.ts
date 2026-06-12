// Tier-level ordering shared by the promotion tournament and its job.
//
// The v1 tournament (computePromotions: base_score gate for B, promotion_score for A/S)
// that used to live here was superseded by promotion-v2.ts (single selection_score gate,
// confidence cap, per-publish-day B buckets) and has been removed as dead code (2026-06-12).

import type { SelectedLevel } from "./types";

const LEVEL_RANK: Record<SelectedLevel, number> = { none: 0, B: 1, A: 2, S: 3 };

/** Numeric rank for level comparison (none < B < A < S). Used by the no-downgrade guard. */
export function levelRank(level: SelectedLevel): number {
  return LEVEL_RANK[level];
}
