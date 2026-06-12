// Deterministic comment_quality_score (Scoring Integrity slice).
//
// Aggregates valid (non-low-value) comments on an event, weighted by:
//   - isExpert: expert comments dominate the signal (spec: "high-quality comments" is a
//     strong promotion signal; experts are the primary high-quality source).
//   - category: praise/criticism/handson/supplement/controversy all count as "substantive";
//     unclassified counts at a reduced weight (we don't know yet whether it's strong).
//
// Low-value comments are filtered upstream (by the classifier) — they never reach this
// aggregator, because they wouldn't even surface to readers. Cold (no valid comments) =>
// commentQualityNeutral baseline so the promotion_score doesn't collapse for a fresh event.

import { scoringConfig, type ScoringConfig } from "./config";
import type { CommentCategory } from "@/comments/classifier";

export interface ValidComment {
  category: CommentCategory;
  isExpert: boolean;
}

export interface CommentQualityInputs {
  /** Pre-filtered to classification === "valid". */
  comments: readonly ValidComment[];
}

export interface CommentQualityBreakdown {
  configVersion: string;
  validCount: number;
  expertCount: number;
  categorizedCount: number;
  weightedTotal: number;
  commentQualityScore: number;
  cold: boolean;
}

const EXPERT_WEIGHT = 3;
const NON_EXPERT_WEIGHT = 1;
const CATEGORIZED_BOOST = 1.5; // a tagged substantive comment outweighs unclassified
/** Weighted signal at which comment_quality_score saturates near 100. */
const SATURATION = 12;

const SUBSTANTIVE_CATEGORIES: ReadonlySet<CommentCategory> = new Set([
  "praise",
  "criticism",
  "handson",
  "supplement",
  "controversy",
]);

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function saturate(weight: number, saturation: number): number {
  if (weight <= 0 || saturation <= 0) return 0;
  return clamp01(Math.log1p(weight) / Math.log1p(saturation));
}

export function computeCommentQualityScore(
  inputs: CommentQualityInputs,
  config: ScoringConfig = scoringConfig,
): { commentQualityScore: number; breakdown: CommentQualityBreakdown } {
  let weightedTotal = 0;
  let expertCount = 0;
  let categorizedCount = 0;

  for (const c of inputs.comments) {
    const base = c.isExpert ? EXPERT_WEIGHT : NON_EXPERT_WEIGHT;
    const categorized = SUBSTANTIVE_CATEGORIES.has(c.category);
    const w = base * (categorized ? CATEGORIZED_BOOST : 1);
    weightedTotal += w;
    if (c.isExpert) expertCount++;
    if (categorized) categorizedCount++;
  }

  if (inputs.comments.length === 0) {
    return {
      commentQualityScore: config.commentQualityNeutral,
      breakdown: {
        configVersion: config.version,
        validCount: 0,
        expertCount: 0,
        categorizedCount: 0,
        weightedTotal: 0,
        commentQualityScore: config.commentQualityNeutral,
        cold: true,
      },
    };
  }

  const norm = saturate(weightedTotal, SATURATION);
  const commentQualityScore = Math.round(norm * 100);
  return {
    commentQualityScore,
    breakdown: {
      configVersion: config.version,
      validCount: inputs.comments.length,
      expertCount,
      categorizedCount,
      weightedTotal,
      commentQualityScore,
      cold: false,
    },
  };
}
