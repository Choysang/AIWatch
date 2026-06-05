// Deterministic selection_score (scoring-v2, SP4 point 8) — the promotion-tournament input.
//
// Replaces scoring-v1's promotion_score. Composition:
//   1. Multiplicative confidence gate (open point D1, locked): low confidence genuinely
//      suppresses high quality rather than averaging against it —
//        gated = quality * (floor + (1-floor) * confidence/100)      (floor = 0.5)
//   2. Bounded comment/citation increments: a neutral (50) signal adds 0; a perfect (100)
//      signal adds the configured max; a zero signal subtracts it. This preserves cold-start
//      events (neutral signals don't move the score) while letting real discussion/citations
//      push it.
//   3. Reader view increment: a small log-saturated bonus, counted only after the user opens
//      the detail page or original source from a card.
//   4. content_type multiplier (open point D2, locked): discussion ×0.9, model_release ×1.05,
//      others ×1.0 — classification influences selection, a core point-8 goal.
// Final score is clamped to [0,100].
//
// Separately, maxLevel encodes open point C1 (locked): confidence below the cap floor (40)
// restricts the event to tier B no matter how high its selection_score — a single low-trust
// item can't rocket to S. The tournament caps the achieved tier at maxLevel.

import { scoringV2Config, type ScoringV2Config } from "./config";
import type { ContentType } from "@/pipeline/judge-schema";
import type { PromotedLevel } from "./types";

export interface SelectionScoreInputs {
  /** event_quality_score, 0-100. */
  qualityScore: number;
  /** confidence_score, 0-100. */
  confidenceScore: number;
  /** comment_quality_score, 0-100 (neutral 50). */
  commentQualityScore: number;
  /** citation_quality_score, 0-100 (neutral 50). */
  citationQualityScore: number;
  /** Reader card-open/original-open count. */
  viewCount?: number;
  contentType: ContentType;
}

export interface SelectionScoreBreakdown {
  configVersion: string;
  gated: number;
  commentBonus: number;
  citationBonus: number;
  viewBonus: number;
  contentTypeMultiplier: number;
  selectionScore: number;
  /** Highest tier this event may reach given its confidence (open point C1). */
  maxLevel: PromotedLevel;
}

export interface SelectionScoreResult {
  selectionScore: number;
  maxLevel: PromotedLevel;
  breakdown: SelectionScoreBreakdown;
}

function clamp0to100(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

/** Maps a 0-100 quality signal (neutral 50) to a [-max, +max] bonus. */
function signalBonus(score: number, max: number): number {
  const centered = (score - 50) / 50; // -1 .. +1
  return centered * max;
}

function saturateCount(count: number, saturation: number): number {
  if (!Number.isFinite(count) || count <= 0 || saturation <= 0) return 0;
  return Math.min(1, Math.log1p(count) / Math.log1p(saturation));
}

export function computeSelectionScore(
  inputs: SelectionScoreInputs,
  config: ScoringV2Config = scoringV2Config,
): SelectionScoreResult {
  const {
    confidenceGateFloor,
    commentBonusMax,
    citationBonusMax,
    viewBonusMax,
    viewSaturation,
    confidenceCapToBBelow,
  } = config.selection;

  const conf = clamp0to100(inputs.confidenceScore);
  const gateFactor = confidenceGateFloor + (1 - confidenceGateFloor) * (conf / 100);
  const gated = clamp0to100(inputs.qualityScore) * gateFactor;

  const commentBonus = signalBonus(inputs.commentQualityScore, commentBonusMax);
  const citationBonus = signalBonus(inputs.citationQualityScore, citationBonusMax);
  const viewBonus = saturateCount(inputs.viewCount ?? 0, viewSaturation) * viewBonusMax;

  const contentTypeMultiplier = config.contentTypeSelectionMultiplier[inputs.contentType];
  const selectionScore = clamp0to100(
    (gated + commentBonus + citationBonus + viewBonus) * contentTypeMultiplier,
  );

  const maxLevel: PromotedLevel = conf < confidenceCapToBBelow ? "B" : "S";

  return {
    selectionScore,
    maxLevel,
    breakdown: {
      configVersion: config.version,
      gated,
      commentBonus,
      citationBonus,
      viewBonus,
      contentTypeMultiplier,
      selectionScore,
      maxLevel,
    },
  };
}
