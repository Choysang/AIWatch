import { describe, expect, test } from "bun:test";
import { scoringV2Config } from "./config";
import { computeConfidenceScore } from "./confidence-score";

describe("computeConfidenceScore", () => {
  test("a single source contributes zero corroboration (low multi-source signal)", () => {
    const { breakdown } = computeConfidenceScore({
      evidenceClarity: 0,
      sourceLevel: "L5",
      sourcePostCount: 1,
      expertValueScore: 0,
    });
    expect(breakdown.components.multiSource).toBe(0);
  });

  test("multi-source corroboration is monotone non-decreasing in post count", () => {
    const at = (n: number) =>
      computeConfidenceScore({
        evidenceClarity: 0,
        sourceLevel: "L5",
        sourcePostCount: n,
        expertValueScore: 0,
      }).breakdown.components.multiSource;
    expect(at(2)).toBeGreaterThan(at(1));
    expect(at(3)).toBeGreaterThan(at(2));
    expect(at(10)).toBeGreaterThanOrEqual(at(3));
  });

  test(">=3 sources drives the corroboration signal high (>70 of its 100 sub-scale)", () => {
    const { breakdown } = computeConfidenceScore({
      evidenceClarity: 0,
      sourceLevel: "L5",
      sourcePostCount: 3,
      expertValueScore: 0,
    });
    // multiSource component is weighted; recover the sub-score before its weight.
    const sub = breakdown.components.multiSource / scoringV2Config.confidenceWeights.multiSource;
    expect(sub).toBeGreaterThan(70);
  });

  test("all maxed signals yield 100", () => {
    const { confidenceScore } = computeConfidenceScore({
      evidenceClarity: 100,
      sourceLevel: "L1",
      sourcePostCount: 50,
      expertValueScore: 100,
    });
    expect(confidenceScore).toBeCloseTo(100, 0);
  });

  test("weighted components sum to the score; stamped + in range", () => {
    const { confidenceScore, breakdown } = computeConfidenceScore({
      evidenceClarity: 60,
      sourceLevel: "L2",
      sourcePostCount: 2,
      expertValueScore: 50,
    });
    expect(confidenceScore).toBeGreaterThanOrEqual(0);
    expect(confidenceScore).toBeLessThanOrEqual(100);
    const sum = Object.values(breakdown.components).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(confidenceScore, 6);
    expect(breakdown.configVersion).toBe(scoringV2Config.version);
  });
});
