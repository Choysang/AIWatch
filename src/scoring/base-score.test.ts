import { describe, expect, test } from "bun:test";
import { computeBaseScore } from "./base-score";
import { scoringConfig } from "./config";
import type { BaseScoreInputs } from "./types";

const fullDims = {
  aiRelevance: 100,
  impact: 100,
  novelty: 100,
  audienceUsefulness: 100,
  evidenceClarity: 100,
};

describe("computeBaseScore", () => {
  test("all-100 inputs with L1 and expert=100 yields 100", () => {
    const { baseScore } = computeBaseScore({
      sourceLevel: "L1",
      dimensions: fullDims,
      externalHeat: 100,
      expertValue: 100,
    });
    expect(baseScore).toBeCloseTo(100, 6);
  });

  test("expert defaults to neutral when omitted", () => {
    const inputs: BaseScoreInputs = { sourceLevel: "L1", dimensions: fullDims, externalHeat: 100 };
    const { breakdown } = computeBaseScore(inputs);
    expect(breakdown.inputs.expertValue).toBe(scoringConfig.expertValueNeutral);
  });

  test("user_value uses the LLM audience_usefulness dimension (cold start)", () => {
    const dims = { ...fullDims, audienceUsefulness: 40 };
    const { breakdown } = computeBaseScore({ sourceLevel: "L1", dimensions: dims, externalHeat: 0 });
    expect(breakdown.inputs.userValue).toBe(40);
  });

  test("golden: known mixed inputs => 59.5", () => {
    // L3=70*.2=14; ai80*.15=12; impact60*.2=12; novelty50*.1=5;
    // heat30*.15=4.5; user(audience70)*.1=7; expert neutral50*.1=5  => 59.5
    const { baseScore } = computeBaseScore({
      sourceLevel: "L3",
      dimensions: { aiRelevance: 80, impact: 60, novelty: 50, audienceUsefulness: 70, evidenceClarity: 90 },
      externalHeat: 30,
    });
    expect(baseScore).toBeCloseTo(59.5, 6);
  });

  test("breakdown components sum to the score and stay in range", () => {
    const { baseScore, breakdown } = computeBaseScore({
      sourceLevel: "L5",
      dimensions: fullDims,
      externalHeat: 0,
    });
    expect(baseScore).toBeGreaterThanOrEqual(0);
    expect(baseScore).toBeLessThanOrEqual(100);
    const sum = Object.values(breakdown.components).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(baseScore, 6);
  });
});
