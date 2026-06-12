// Deterministic base_score for a single event. Pure function -> unit golden tests.
// (Bulk recompute + the promotion tournament are raw SQL in db/jobs in later slices.)
// Cold start: user_value = LLM audience_usefulness; expert_value = neutral (no signal yet).

import { scoringConfig, type ScoringConfig } from "./config";
import type { BaseScoreInputs, ScoreBreakdown } from "./types";

export function computeBaseScore(
  inputs: BaseScoreInputs,
  config: ScoringConfig = scoringConfig,
): { baseScore: number; breakdown: ScoreBreakdown } {
  const w = config.baseWeights;
  const sourceScore = config.sourceLevelScore[inputs.sourceLevel];
  const userValue = inputs.dimensions.audienceUsefulness; // cold-start user_value
  const expertValue = inputs.expertValue ?? config.expertValueNeutral;

  const components: Record<string, number> = {
    source: sourceScore * w.source,
    aiRelevance: inputs.dimensions.aiRelevance * w.aiRelevance,
    impact: inputs.dimensions.impact * w.impact,
    novelty: inputs.dimensions.novelty * w.novelty,
    externalHeat: inputs.externalHeat * w.externalHeat,
    userValue: userValue * w.userValue,
    expertValue: expertValue * w.expertValue,
  };
  const baseScore = Object.values(components).reduce((a, b) => a + b, 0);

  return {
    baseScore,
    breakdown: {
      configVersion: config.version,
      inputs: {
        sourceScore,
        aiRelevance: inputs.dimensions.aiRelevance,
        impact: inputs.dimensions.impact,
        novelty: inputs.dimensions.novelty,
        externalHeat: inputs.externalHeat,
        userValue,
        expertValue,
      },
      weights: w,
      components,
      baseScore,
    },
  };
}
