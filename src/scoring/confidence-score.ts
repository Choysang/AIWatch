// Deterministic confidence_score (scoring-v2, SP4 point 8) — entirely new dimension.
//
// "How sure are we this is real and important?" — orthogonal to intrinsic quality. Composed
// of four 0-100 sub-signals, weighted to sum 1:
//   - evidenceClarity: the LLM's read of how well-supported the claim is.
//   - sourceLevel:     authority of the origin source (L1=100 … L5=40).
//   - multiSource:     CORROBORATION across independent posts merged into this event. A lone
//                      post contributes 0 (single-source rumor); each additional independent
//                      post adds log-saturating signal (~3 corroborations => high).
//   - expert:          real expert backing (expert_value_score; neutral 50 when cold).
//
// Open point B1 (locked): scoring-v1's userValue folds in here as part of "how trusted",
// rather than into intrinsic quality. Sub-scores are kept as floats so the weighted
// components sum exactly to confidence_score (no mid-way rounding drift).

import { scoringConfig, scoringV2Config, type ScoringV2Config } from "./config";
import type { SourceLevel } from "./types";

export interface ConfidenceInputs {
  /** LLM evidenceClarity dimension, 0-100. */
  evidenceClarity: number;
  sourceLevel: SourceLevel;
  /** Independent posts merged into this event (>=1). 1 => no corroboration. */
  sourcePostCount: number;
  /** expert_value_score, 0-100 (neutral 50 when no expert acted). */
  expertValueScore: number;
}

export interface ConfidenceBreakdown {
  configVersion: string;
  subScores: {
    evidenceClarity: number;
    sourceLevel: number;
    multiSource: number;
    expert: number;
  };
  weights: ScoringV2Config["confidenceWeights"];
  components: {
    evidenceClarity: number;
    sourceLevel: number;
    multiSource: number;
    expert: number;
  };
  corroboratingSources: number;
  confidenceScore: number;
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Log saturation: 0 -> 0, large -> 1. Monotone increasing. */
function saturate(count: number, saturation: number): number {
  if (count <= 0 || saturation <= 0) return 0;
  return clamp01(Math.log1p(count) / Math.log1p(saturation));
}

function clampScore(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

export function computeConfidenceScore(
  inputs: ConfidenceInputs,
  config: ScoringV2Config = scoringV2Config,
): { confidenceScore: number; breakdown: ConfidenceBreakdown } {
  const w = config.confidenceWeights;

  // Corroboration counts ADDITIONAL independent sources beyond the first.
  const corroboratingSources = Math.max(0, Math.floor(inputs.sourcePostCount) - 1);

  const subScores = {
    evidenceClarity: clampScore(inputs.evidenceClarity),
    sourceLevel: scoringConfig.sourceLevelScore[inputs.sourceLevel],
    multiSource: saturate(corroboratingSources, config.multiSourceSaturation) * 100,
    expert: clampScore(inputs.expertValueScore),
  };

  const components = {
    evidenceClarity: subScores.evidenceClarity * w.evidenceClarity,
    sourceLevel: subScores.sourceLevel * w.sourceLevel,
    multiSource: subScores.multiSource * w.multiSource,
    expert: subScores.expert * w.expert,
  };
  const confidenceScore =
    components.evidenceClarity + components.sourceLevel + components.multiSource + components.expert;

  return {
    confidenceScore,
    breakdown: {
      configVersion: config.version,
      subScores,
      weights: w,
      components,
      corroboratingSources,
      confidenceScore,
    },
  };
}
