// Deterministic event_quality_score (scoring-v2, SP4 point 8).
//
// Intrinsic content quality, DECOUPLED from popularity. Unlike scoring-v1's base_score this
// drops externalHeat and userValue entirely (open point B1 (locked): userValue's "people
// approve of this" signal belongs to confidence_score, not intrinsic quality). The remaining
// terms — source authority + LLM impact/novelty/audienceUsefulness/evidenceClarity — are
// re-normalized to sum 1, so the score stays on a 0-100 scale.

import { scoringConfig, scoringV2Config, type ScoringV2Config } from "./config";
import type { SourceLevel } from "./types";

export interface EventQualityDimensions {
  impact: number;
  novelty: number;
  audienceUsefulness: number;
  evidenceClarity: number;
}

export interface EventQualityInputs {
  sourceLevel: SourceLevel;
  dimensions: EventQualityDimensions;
}

export interface EventQualityBreakdown {
  configVersion: string;
  inputs: {
    sourceScore: number;
    impact: number;
    novelty: number;
    audienceUsefulness: number;
    evidenceClarity: number;
  };
  weights: ScoringV2Config["qualityWeights"];
  components: Record<string, number>;
  qualityScore: number;
}

export function computeEventQualityScore(
  inputs: EventQualityInputs,
  config: ScoringV2Config = scoringV2Config,
): { qualityScore: number; breakdown: EventQualityBreakdown } {
  const w = config.qualityWeights;
  const sourceScore = scoringConfig.sourceLevelScore[inputs.sourceLevel];
  const d = inputs.dimensions;

  const components: Record<string, number> = {
    source: sourceScore * w.source,
    impact: d.impact * w.impact,
    novelty: d.novelty * w.novelty,
    audienceUsefulness: d.audienceUsefulness * w.audienceUsefulness,
    evidenceClarity: d.evidenceClarity * w.evidenceClarity,
  };
  const qualityScore = Object.values(components).reduce((a, b) => a + b, 0);

  return {
    qualityScore,
    breakdown: {
      configVersion: config.version,
      inputs: {
        sourceScore,
        impact: d.impact,
        novelty: d.novelty,
        audienceUsefulness: d.audienceUsefulness,
        evidenceClarity: d.evidenceClarity,
      },
      weights: w,
      components,
      qualityScore,
    },
  };
}
