// Compose pure-function entry point for the Scoring Integrity slice.
//
// Given a base_score (from Slice 0) and the loaded signal bundle (from
// db/queries/promotion-signals), runs the four aggregators + promotion_score formula,
// returning a single packaged breakdown. Keeps call sites flat: jobs/handlers don't
// reach into individual aggregators.

import { scoringConfig, type ScoringConfig } from "./config";
import {
  computeCitationQualityScore,
  type CitationQualityBreakdown,
  type CitationQualityInputs,
} from "./citation-quality";
import {
  computeCommentQualityScore,
  type CommentQualityBreakdown,
  type ValidComment,
} from "./comment-quality";
import {
  computeDisplayScore,
  type DisplayScoreBreakdown,
} from "./display-score";
import {
  computeExpertValueScore,
  type ExpertAction,
  type ExpertValueBreakdown,
} from "./expert-value";
import {
  computePromotionScore,
  type PromotionScoreBreakdown,
} from "./promotion-score";
import type { SelectedLevel } from "./types";

export interface ComposeInputs {
  baseScore: number;
  expertActions: readonly ExpertAction[];
  validComments: readonly ValidComment[];
  /** Optional in V1 — citations aren't tracked yet (defaults to neutral). */
  citations?: CitationQualityInputs["citations"];
  /** Required for display-score decay. */
  level: SelectedLevel;
  /** events.peak_score; null/undefined => fall back to the newly-computed promotion_score. */
  priorPeakScore?: number | null;
  /** Hours since events.last_strong_signal_at (or promoted_at). */
  ageSinceLastStrongSignalHours: number;
}

export interface ComposeBreakdown {
  configVersion: string;
  promotionConfigVersion: string;
  baseScore: number;
  expertValue: ExpertValueBreakdown;
  commentQuality: CommentQualityBreakdown;
  citationQuality: CitationQualityBreakdown;
  promotion: PromotionScoreBreakdown;
  display: DisplayScoreBreakdown;
  /** Ratcheted peak: max(priorPeakScore, promotionScore). */
  peakScore: number;
}

export interface ComposeResult {
  expertValueScore: number;
  citationQualityScore: number;
  commentQualityScore: number;
  promotionScore: number;
  displayScore: number;
  peakScore: number;
  breakdown: ComposeBreakdown;
}

export function composePromotionScores(
  inputs: ComposeInputs,
  config: ScoringConfig = scoringConfig,
): ComposeResult {
  const expert = computeExpertValueScore({ actions: inputs.expertActions }, config);
  const comment = computeCommentQualityScore({ comments: inputs.validComments }, config);
  const citation = computeCitationQualityScore({ citations: inputs.citations }, config);

  const promotion = computePromotionScore(
    {
      baseScore: inputs.baseScore,
      expertValueScore: expert.expertValueScore,
      citationQualityScore: citation.citationQualityScore,
      commentQualityScore: comment.commentQualityScore,
    },
    config,
  );

  // Peak ratchets upward only; new strong signals re-arm it (handled by the caller, which
  // sets events.last_strong_signal_at when a real signal lands).
  const prior = inputs.priorPeakScore ?? promotion.promotionScore;
  const peakScore = Math.max(prior, promotion.promotionScore);

  const display = computeDisplayScore(
    {
      level: inputs.level,
      peakScore,
      ageSinceLastStrongSignalHours: inputs.ageSinceLastStrongSignalHours,
    },
    config,
  );

  return {
    expertValueScore: expert.expertValueScore,
    citationQualityScore: citation.citationQualityScore,
    commentQualityScore: comment.commentQualityScore,
    promotionScore: promotion.promotionScore,
    displayScore: display.displayScore,
    peakScore,
    breakdown: {
      configVersion: config.version,
      promotionConfigVersion: config.promotion.version,
      baseScore: inputs.baseScore,
      expertValue: expert.breakdown,
      commentQuality: comment.breakdown,
      citationQuality: citation.breakdown,
      promotion: promotion.breakdown,
      display: display.breakdown,
      peakScore,
    },
  };
}
