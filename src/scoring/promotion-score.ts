// Deterministic promotion_score (Scoring Integrity slice).
//
// Spec § Scoring System — A/S promotion uses a composite signal beyond base_score:
//
//   promotion_score =
//     base_score          * 0.55
//     + expert_value      * 0.20
//     + citation_quality  * 0.15
//     + comment_quality   * 0.10
//
// Weights are config-managed (scoringConfig.promotionScoreWeights, sum-asserted to 1).
// All four inputs are 0-100; the resulting promotion_score is also 0-100.
//
// B-tier promotion still uses base_score (or expert direct-push); A/S use this composite.
// See check-promotion job for the gating logic.

import { scoringConfig, type ScoringConfig } from "./config";

export interface PromotionScoreInputs {
  baseScore: number;
  expertValueScore: number;
  citationQualityScore: number;
  commentQualityScore: number;
}

export interface PromotionScoreBreakdown {
  configVersion: string;
  inputs: PromotionScoreInputs;
  weights: ScoringConfig["promotionScoreWeights"];
  components: {
    base: number;
    expert: number;
    citation: number;
    comment: number;
  };
  promotionScore: number;
}

function clamp0to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function computePromotionScore(
  inputs: PromotionScoreInputs,
  config: ScoringConfig = scoringConfig,
): { promotionScore: number; breakdown: PromotionScoreBreakdown } {
  const w = config.promotionScoreWeights;
  const components = {
    base: clamp0to100(inputs.baseScore) * w.base,
    expert: clamp0to100(inputs.expertValueScore) * w.expert,
    citation: clamp0to100(inputs.citationQualityScore) * w.citation,
    comment: clamp0to100(inputs.commentQualityScore) * w.comment,
  };
  const promotionScore =
    components.base + components.expert + components.citation + components.comment;

  return {
    promotionScore,
    breakdown: {
      configVersion: config.version,
      inputs,
      weights: w,
      components,
      promotionScore,
    },
  };
}
