// Scoring config-as-code (locked decision). The single source of truth for the
// numbers; every computed score is stamped with `version`. Changing a weight is a
// reviewable PR + a version bump + a recompute — never a re-inference.

import type { BaseWeights, Platform, SourceLevel } from "./types";

export interface ScoringConfig {
  version: string;
  baseWeights: BaseWeights;
  sourceLevelScore: Record<SourceLevel, number>;
  externalHeat: {
    metricWeights: { like: number; repost: number; reply: number; star: number; comment: number };
    platformSaturation: Partial<Record<Platform, number>>;
    defaultSaturation: number;
  };
  /** Cold-start expert value when no expert has acted (0=negative, 50=no signal, 100=strong positive). */
  expertValueNeutral: number;

  // --- Proposed defaults; used in later slices, calibrate with real data. ---
  gradeFloors: { B: number; A: number; S: number };
  slotLimits: { dailyB: number; weeklyA: number; monthlyS: number };
  decayHalfLifeDays: { B: number; A: number; S: number };
  freshnessHalfLifeDays: number;
}

export const scoringConfig: ScoringConfig = {
  version: "scoring-v1",
  baseWeights: {
    source: 0.2,
    aiRelevance: 0.15,
    impact: 0.2,
    novelty: 0.1,
    externalHeat: 0.15,
    userValue: 0.1,
    expertValue: 0.1,
  },
  sourceLevelScore: { L1: 100, L2: 85, L3: 70, L4: 55, L5: 40 },
  externalHeat: {
    metricWeights: { like: 1, repost: 3, reply: 2, star: 2, comment: 2 },
    platformSaturation: {
      x: 5000,
      github: 800,
      reddit: 3000,
      hackernews: 600,
      youtube: 50000,
      bilibili: 50000,
      zhihu: 2000,
      weibo: 20000,
      huggingface: 500,
    },
    defaultSaturation: 1000,
  },
  expertValueNeutral: 50,

  gradeFloors: { B: 75, A: 86, S: 94 },
  slotLimits: { dailyB: 20, weeklyA: 12, monthlyS: 5 },
  decayHalfLifeDays: { B: 3, A: 10, S: 30 },
  freshnessHalfLifeDays: 2,
};

// Invariant: base weights must sum to 1 (deterministic-scoring contract). Fail fast.
const weightSum = Object.values(scoringConfig.baseWeights).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1) > 1e-9) {
  throw new Error(`[${scoringConfig.version}] base weights must sum to 1, got ${weightSum}`);
}
