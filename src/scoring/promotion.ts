// Deterministic B/A/S promotion tournament (Slice 1). Pure function -> golden tests.
// The job (db/jobs/check-promotion) loads candidates and persists decisions; this module
// owns ONLY the decision logic so it can be exhaustively unit-tested with no DB.
//
// Policy (Slice 1, promotion_score = base_score):
//   - A tier qualifies on score >= threshold AND published within the tier's rolling window.
//   - Tiers are assigned highest-first (S -> A -> B); thresholds nest (94>=86>=75) so a
//     high scorer that loses a scarce S/A slot cascades down to compete for the next tier.
//   - Each tier takes the top `slots` candidates by score (ties broken deterministically).
//   - Only winners are returned; non-winners and out-of-window events are left untouched by
//     the job, so previously selected events never downgrade.

import { scoringConfig, type ScoringConfig } from "./config";
import type { PromotedLevel, SelectedLevel } from "./types";

const TIER_ORDER: readonly PromotedLevel[] = ["S", "A", "B"];

const LEVEL_RANK: Record<SelectedLevel, number> = { none: 0, B: 1, A: 2, S: 3 };

/** Numeric rank for level comparison (none < B < A < S). Used by the no-downgrade guard. */
export function levelRank(level: SelectedLevel): number {
  return LEVEL_RANK[level];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromotionCandidate {
  id: string;
  /** promotion_score; equals base_score in Slice 1. */
  promotionScore: number;
  /** Candidacy window is measured against this; null = ineligible (no known time). */
  publishedAt: Date | null;
  currentLevel: SelectedLevel;
}

export interface PromotionDecision {
  id: string;
  level: PromotedLevel;
  label: string;
  promotionScore: number;
  threshold: number;
  windowDays: number;
  /** 1-based rank among this tier's winners (for the explainable breakdown). */
  rankInWindow: number;
  slotLimit: number;
}

function compareCandidates(a: PromotionCandidate, b: PromotionCandidate): number {
  if (b.promotionScore !== a.promotionScore) return b.promotionScore - a.promotionScore;
  const at = a.publishedAt?.getTime() ?? 0;
  const bt = b.publishedAt?.getTime() ?? 0;
  if (bt !== at) return bt - at; // more recent first
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable final tiebreak
}

export function computePromotions(
  candidates: readonly PromotionCandidate[],
  now: Date = new Date(),
  config: ScoringConfig = scoringConfig,
): PromotionDecision[] {
  const p = config.promotion;
  const assigned = new Set<string>();
  const decisions: PromotionDecision[] = [];

  for (const level of TIER_ORDER) {
    const threshold = p.thresholds[level];
    const cutoff = now.getTime() - p.windowDays[level] * DAY_MS;

    const eligible = candidates
      .filter(
        (c) =>
          !assigned.has(c.id) &&
          c.promotionScore >= threshold &&
          c.publishedAt != null &&
          c.publishedAt.getTime() >= cutoff,
      )
      .sort(compareCandidates);

    const slots = p.slots[level];
    eligible.slice(0, slots).forEach((c, index) => {
      assigned.add(c.id);
      decisions.push({
        id: c.id,
        level,
        label: p.labels[level],
        promotionScore: c.promotionScore,
        threshold,
        windowDays: p.windowDays[level],
        rankInWindow: index + 1,
        slotLimit: slots,
      });
    });
  }

  return decisions;
}
