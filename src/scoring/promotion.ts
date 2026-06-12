// Deterministic B/A/S promotion tournament. Pure function -> golden tests.
// The job (db/jobs/check-promotion) loads candidates and persists decisions; this module
// owns ONLY the decision logic so it can be exhaustively unit-tested with no DB.
//
// Policy (Scoring Integrity slice):
//   - B tier qualifies on base_score >= 75 within 24h, OR expert direct-push (bypass:
//     the direct-push flag stands in for the score threshold and is treated as if the
//     event scored at the B threshold so it cascades correctly when slots are scarce).
//   - A / S tiers qualify on promotion_score (= base*0.55 + expert*0.20 + citation*0.15 +
//     comment*0.10) within their rolling window. The promotion_score is the single value
//     that mixes reader and expert signal into the deterministic decision (spec § Scoring).
//   - Tiers are assigned highest-first (S -> A -> B); thresholds nest (94>=86>=75 on
//     promotion_score), so a high scorer that loses a scarce S/A slot cascades down to
//     compete for the next tier — but B-tier eligibility re-checks base_score, because B
//     is the entry tier and shouldn't require reader/expert reactions.
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
  /** Deterministic base score from LLM dimensions (Slice 0). Gates B-tier entry. */
  baseScore: number;
  /** Composite promotion_score (Slice integrity). Gates A/S tiers. Defaults to baseScore
   *  if not supplied so older callers (and the simplest hot path) still work. */
  promotionScore?: number;
  /** Candidacy window is measured against this; null = ineligible (no known time). */
  publishedAt: Date | null;
  currentLevel: SelectedLevel;
  /** Non-null = certified expert direct-push to B. Bypasses base_score threshold for B
   *  only; A/S still require promotion_score above their thresholds. */
  directPushAt?: Date | null;
}

export interface PromotionDecision {
  id: string;
  level: PromotedLevel;
  label: string;
  /** Score that decided this tier: baseScore for B, promotionScore for A/S. */
  promotionScore: number;
  threshold: number;
  windowDays: number;
  /** 1-based rank among this tier's winners (for the explainable breakdown). */
  rankInWindow: number;
  slotLimit: number;
  /** True iff the B-tier win was forced by direct-push rather than the base_score threshold. */
  directPushed?: boolean;
}

interface CandidateWithScores {
  source: PromotionCandidate;
  /** Effective score for the current tier. */
  score: number;
  directPushed: boolean;
}

function compareCandidates(a: CandidateWithScores, b: CandidateWithScores): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.source.publishedAt?.getTime() ?? 0;
  const bt = b.source.publishedAt?.getTime() ?? 0;
  if (bt !== at) return bt - at; // more recent first
  return a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0;
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
    const usePromotionScore = level !== "B";

    const eligible: CandidateWithScores[] = [];
    for (const c of candidates) {
      if (assigned.has(c.id)) continue;
      if (c.publishedAt == null) continue;
      if (c.publishedAt.getTime() < cutoff) continue;

      if (usePromotionScore) {
        // A / S: promotion_score gates, no direct-push bypass.
        const score = c.promotionScore ?? c.baseScore;
        if (score < threshold) continue;
        eligible.push({ source: c, score, directPushed: false });
      } else {
        // B: base_score gates, with direct-push bypass.
        const directPushed = c.directPushAt != null;
        const score = c.baseScore;
        if (!directPushed && score < threshold) continue;
        eligible.push({
          source: c,
          // Treat direct-pushed events as if they tied the threshold so they compete fairly
          // against scored entries (deterministic + breakdown-friendly).
          score: directPushed ? Math.max(score, threshold) : score,
          directPushed,
        });
      }
    }

    eligible.sort(compareCandidates);

    const slots = p.slots[level];
    eligible.slice(0, slots).forEach((w, index) => {
      assigned.add(w.source.id);
      const decision: PromotionDecision = {
        id: w.source.id,
        level,
        label: p.labels[level],
        promotionScore: w.score,
        threshold,
        windowDays: p.windowDays[level],
        rankInWindow: index + 1,
        slotLimit: slots,
      };
      if (w.directPushed) decision.directPushed = true;
      decisions.push(decision);
    });
  }

  return decisions;
}
