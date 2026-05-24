// Scoring config-as-code (locked decision). The single source of truth for the
// numbers; every computed score is stamped with `version`. Changing a weight is a
// reviewable PR + a version bump + a recompute — never a re-inference.

import type { BaseWeights, Platform, PromotedLevel, SourceLevel } from "./types";

/** Per-tier numbers for the promotion tournament (Slice 1). */
export interface PromotionConfig {
  version: string;
  /** Minimum score to qualify for a tier (spec: B>=75, A>=86, S>=94). */
  thresholds: Record<PromotedLevel, number>;
  /** Slot caps per window: B per day, A per week, S per month. */
  slots: Record<PromotedLevel, number>;
  /** Rolling candidacy window per tier, in days (today=1, week=7, month=30). */
  windowDays: Record<PromotedLevel, number>;
  /** Display label written to events.selected_label (CONTENT_LANG = zh). */
  labels: Record<PromotedLevel, string>;
}

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

  promotion: PromotionConfig;
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

  // Slice 1 promotion tournament. Uses Slice 0 signals only (promotion_score =
  // base_score); the full formula's expert/citation/comment terms land in later slices.
  promotion: {
    version: "promotion-v1",
    thresholds: { B: 75, A: 86, S: 94 },
    slots: { B: 20, A: 12, S: 5 },
    windowDays: { B: 1, A: 7, S: 30 },
    labels: { B: "当日精选", A: "本周精选", S: "本月精选" },
  },
};

// Invariant: base weights must sum to 1 (deterministic-scoring contract). Fail fast.
const weightSum = Object.values(scoringConfig.baseWeights).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1) > 1e-9) {
  throw new Error(`[${scoringConfig.version}] base weights must sum to 1, got ${weightSum}`);
}
