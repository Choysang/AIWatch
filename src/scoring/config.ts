// Scoring config-as-code (locked decision). The single source of truth for the
// numbers; every computed score is stamped with `version`. Changing a weight is a
// reviewable PR + a version bump + a recompute — never a re-inference.

import type { ContentType } from "@/pipeline/judge-schema";
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

/** promotion_score weights (spec § Scoring System). Sum to 1 by contract. */
export interface PromotionScoreWeights {
  base: number;
  expert: number;
  citation: number;
  comment: number;
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
  /** Neutral baseline for citation_quality_score when citations are not tracked yet. */
  citationQualityNeutral: number;
  /** Neutral baseline for comment_quality_score when no valid comments exist. */
  commentQualityNeutral: number;

  // --- Proposed defaults; used in later slices, calibrate with real data. ---
  gradeFloors: { B: number; A: number; S: number };
  slotLimits: { dailyB: number; weeklyA: number; monthlyS: number };
  decayHalfLifeDays: { B: number; A: number; S: number };
  freshnessHalfLifeDays: number;

  promotion: PromotionConfig;
  promotionScoreWeights: PromotionScoreWeights;
}

// --- scoring-v2 (SP4 point 8): layered scoring that separates relevance / intrinsic
// quality / confidence / selection. Lives alongside scoring-v1 until the migration +
// recompute stage (4.2) flips persistence over and bumps the global version stamp.
// Deterministic-scoring contract holds: LLM produces immutable dimensions, these weights
// are config-as-code, every v2 score is stamped with `scoringV2Config.version`.

/** event_quality_score weights (de-popularized: no externalHeat/userValue). Sum to 1. */
export interface QualityWeights {
  source: number;
  impact: number;
  novelty: number;
  audienceUsefulness: number;
  evidenceClarity: number;
}

/** confidence_score weights ("how sure are we this is real and important"). Sum to 1. */
export interface ConfidenceWeights {
  evidenceClarity: number;
  sourceLevel: number;
  /** Multi-source corroboration (independent posts merged into the event). */
  multiSource: number;
  expert: number;
}

export interface SelectionConfig {
  /** Confidence floor in the multiplicative gate: selection = quality*(floor + (1-floor)*conf/100). */
  confidenceGateFloor: number;
  /** Max points a fully-positive comment signal (100) adds; neutral (50) adds 0. */
  commentBonusMax: number;
  /** Max points a fully-positive citation signal (100) adds; neutral (50) adds 0. */
  citationBonusMax: number;
  /** confidence_score strictly below this caps an event's promotion at tier B (open point C1). */
  confidenceCapToBBelow: number;
}

export interface ScoringV2Config {
  version: string;
  /** relevance_gate hard floor: aiRelevance must be >= this (open point A1: aiRelevance only). */
  relevanceMin: number;
  qualityWeights: QualityWeights;
  confidenceWeights: ConfidenceWeights;
  /** Log-saturation constant for corroborating sources (count-1). ~3 corroborations => high. */
  multiSourceSaturation: number;
  selection: SelectionConfig;
  /** content_type adjustment applied to selection_score (open point D2: included). */
  contentTypeSelectionMultiplier: Record<ContentType, number>;
}

export const scoringV2Config: ScoringV2Config = {
  version: "scoring-v2",
  relevanceMin: 50,
  // De-popularized intrinsic quality (externalHeat/userValue removed vs base_score; userValue
  // folds into confidence per open point B1). Re-normalized to sum 1.
  qualityWeights: {
    source: 0.25,
    impact: 0.3,
    novelty: 0.15,
    audienceUsefulness: 0.15,
    evidenceClarity: 0.15,
  },
  confidenceWeights: { evidenceClarity: 0.35, sourceLevel: 0.25, multiSource: 0.25, expert: 0.15 },
  multiSourceSaturation: 3,
  selection: {
    confidenceGateFloor: 0.5,
    commentBonusMax: 8,
    citationBonusMax: 6,
    confidenceCapToBBelow: 40,
  },
  // discussion is harder to promote; model_release gets a small edge. Open point D2: included.
  contentTypeSelectionMultiplier: {
    model_release: 1.05,
    product_release: 1.0,
    tech_share: 1.0,
    discussion: 0.9,
  },
};

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
  citationQualityNeutral: 50,
  commentQualityNeutral: 50,

  gradeFloors: { B: 75, A: 86, S: 94 },
  slotLimits: { dailyB: 20, weeklyA: 12, monthlyS: 5 },
  decayHalfLifeDays: { B: 3, A: 10, S: 30 },
  freshnessHalfLifeDays: 2,

  // Promotion tournament (Slice 1). B-tier uses base_score directly (spec § B/daily: "score >= 75
  // or expert direct-push"); A/S use promotion_score (Scoring Integrity slice) which composes
  // base + expert + citation + comment.
  promotion: {
    version: "promotion-v2",
    thresholds: { B: 75, A: 86, S: 94 },
    slots: { B: 20, A: 12, S: 5 },
    windowDays: { B: 1, A: 7, S: 30 },
    labels: { B: "当日精选", A: "本周精选", S: "本月精选" },
  },

  // promotion_score = base*0.55 + expert*0.20 + citation*0.15 + comment*0.10 (spec § Scoring).
  // Weights sum to 1 (asserted below). When a signal is absent the aggregator returns the
  // matching `*Neutral` value so a B-tier event with no comments/citations doesn't collapse.
  promotionScoreWeights: { base: 0.55, expert: 0.2, citation: 0.15, comment: 0.1 },
};

// Invariant: base weights must sum to 1 (deterministic-scoring contract). Fail fast.
const weightSum = Object.values(scoringConfig.baseWeights).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1) > 1e-9) {
  throw new Error(`[${scoringConfig.version}] base weights must sum to 1, got ${weightSum}`);
}

// Same invariant for promotion-score weights (spec § Scoring System).
const promoWeightSum = Object.values(scoringConfig.promotionScoreWeights).reduce(
  (a, b) => a + b,
  0,
);
if (Math.abs(promoWeightSum - 1) > 1e-9) {
  throw new Error(
    `[${scoringConfig.version}] promotion-score weights must sum to 1, got ${promoWeightSum}`,
  );
}

// scoring-v2 invariants: quality and confidence weight sets must each sum to 1 so the
// composed scores stay on a 0-100 scale. Fail fast at import.
const qualityWeightSum = Object.values(scoringV2Config.qualityWeights).reduce((a, b) => a + b, 0);
if (Math.abs(qualityWeightSum - 1) > 1e-9) {
  throw new Error(
    `[${scoringV2Config.version}] quality weights must sum to 1, got ${qualityWeightSum}`,
  );
}

const confidenceWeightSum = Object.values(scoringV2Config.confidenceWeights).reduce(
  (a, b) => a + b,
  0,
);
if (Math.abs(confidenceWeightSum - 1) > 1e-9) {
  throw new Error(
    `[${scoringV2Config.version}] confidence weights must sum to 1, got ${confidenceWeightSum}`,
  );
}
