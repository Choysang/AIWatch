import { describe, expect, test } from "bun:test";
import { scoringV2Config } from "./config";
import { computeEventQualityScore } from "./event-quality-score";

const fullDims = { impact: 100, novelty: 100, audienceUsefulness: 100, evidenceClarity: 100 };

describe("computeEventQualityScore", () => {
  test("all-100 dimensions with L1 source yields 100", () => {
    const { qualityScore } = computeEventQualityScore({
      sourceLevel: "L1",
      dimensions: fullDims,
    });
    expect(qualityScore).toBeCloseTo(100, 6);
  });

  test("golden: known mixed inputs", () => {
    // L3=70*.25=17.5; impact60*.30=18; novelty50*.15=7.5; audience70*.15=10.5;
    // evidence90*.15=13.5  => 67
    const { qualityScore } = computeEventQualityScore({
      sourceLevel: "L3",
      dimensions: { impact: 60, novelty: 50, audienceUsefulness: 70, evidenceClarity: 90 },
    });
    expect(qualityScore).toBeCloseTo(67, 6);
  });

  test("is independent of popularity — no externalHeat/userValue terms exist", () => {
    const { breakdown } = computeEventQualityScore({ sourceLevel: "L2", dimensions: fullDims });
    expect(breakdown.components).not.toHaveProperty("externalHeat");
    expect(breakdown.components).not.toHaveProperty("userValue");
    expect(Object.keys(breakdown.components).sort()).toEqual(
      ["audienceUsefulness", "evidenceClarity", "impact", "novelty", "source"].sort(),
    );
  });

  test("breakdown components sum to the score and stay in range", () => {
    const { qualityScore, breakdown } = computeEventQualityScore({
      sourceLevel: "L5",
      dimensions: { impact: 30, novelty: 80, audienceUsefulness: 40, evidenceClarity: 20 },
    });
    expect(qualityScore).toBeGreaterThanOrEqual(0);
    expect(qualityScore).toBeLessThanOrEqual(100);
    const sum = Object.values(breakdown.components).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(qualityScore, 6);
    expect(breakdown.configVersion).toBe(scoringV2Config.version);
  });
});
