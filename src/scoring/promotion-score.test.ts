// Golden tests for the deterministic promotion_score composite.

import { describe, expect, test } from "bun:test";
import { computePromotionScore } from "./promotion-score";
import { scoringConfig } from "./config";

describe("computePromotionScore", () => {
  test("base only, all-neutral signals", () => {
    const r = computePromotionScore({
      baseScore: 80,
      expertValueScore: 50,
      citationQualityScore: 50,
      commentQualityScore: 50,
    });
    // 80*0.55 + 50*0.20 + 50*0.15 + 50*0.10 = 44 + 10 + 7.5 + 5 = 66.5
    expect(r.promotionScore).toBeCloseTo(66.5, 5);
    expect(r.breakdown.weights).toBe(scoringConfig.promotionScoreWeights);
  });

  test("strong expert + strong comments boost composite well above base", () => {
    const r = computePromotionScore({
      baseScore: 80,
      expertValueScore: 95,
      citationQualityScore: 50,
      commentQualityScore: 90,
    });
    // 80*0.55 + 95*0.20 + 50*0.15 + 90*0.10 = 44 + 19 + 7.5 + 9 = 79.5
    expect(r.promotionScore).toBeCloseTo(79.5, 5);
  });

  test("all 100 yields 100; all 0 yields 0", () => {
    expect(
      computePromotionScore({
        baseScore: 100,
        expertValueScore: 100,
        citationQualityScore: 100,
        commentQualityScore: 100,
      }).promotionScore,
    ).toBeCloseTo(100, 5);
    expect(
      computePromotionScore({
        baseScore: 0,
        expertValueScore: 0,
        citationQualityScore: 0,
        commentQualityScore: 0,
      }).promotionScore,
    ).toBeCloseTo(0, 5);
  });

  test("clamps inputs to 0-100", () => {
    const r = computePromotionScore({
      baseScore: 150,
      expertValueScore: -10,
      citationQualityScore: 200,
      commentQualityScore: 50,
    });
    // clamped: 100*0.55 + 0*0.20 + 100*0.15 + 50*0.10 = 55 + 0 + 15 + 5 = 75
    expect(r.promotionScore).toBeCloseTo(75, 5);
  });

  test("breakdown components add up to promotionScore", () => {
    const r = computePromotionScore({
      baseScore: 70,
      expertValueScore: 60,
      citationQualityScore: 55,
      commentQualityScore: 65,
    });
    const sum =
      r.breakdown.components.base +
      r.breakdown.components.expert +
      r.breakdown.components.citation +
      r.breakdown.components.comment;
    expect(sum).toBeCloseTo(r.promotionScore, 5);
  });
});
