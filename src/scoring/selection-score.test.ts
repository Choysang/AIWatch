import { describe, expect, test } from "bun:test";
import { computeSelectionScore } from "./selection-score";

const neutralSignals = { commentQualityScore: 50, citationQualityScore: 50 };

describe("computeSelectionScore", () => {
  test("neutral comment/citation signals add nothing; full confidence passes quality through", () => {
    const { selectionScore } = computeSelectionScore({
      qualityScore: 80,
      confidenceScore: 100,
      contentType: "product_release",
      ...neutralSignals,
    });
    expect(selectionScore).toBeCloseTo(80, 6);
  });

  test("zero confidence halves quality via the multiplicative gate (floor 0.5)", () => {
    const { selectionScore } = computeSelectionScore({
      qualityScore: 80,
      confidenceScore: 0,
      contentType: "product_release",
      ...neutralSignals,
    });
    expect(selectionScore).toBeCloseTo(40, 6);
  });

  test("content_type multiplier: discussion is penalized, model_release nudged up (clamped at 100)", () => {
    const discussion = computeSelectionScore({
      qualityScore: 100,
      confidenceScore: 100,
      contentType: "discussion",
      ...neutralSignals,
    }).selectionScore;
    expect(discussion).toBeCloseTo(90, 6); // 100 * 0.9

    const model = computeSelectionScore({
      qualityScore: 100,
      confidenceScore: 100,
      contentType: "model_release",
      ...neutralSignals,
    }).selectionScore;
    expect(model).toBeCloseTo(100, 6); // 100 * 1.05 clamped to 100
  });

  test("strong comments and citations add bounded bonuses; weak ones subtract", () => {
    const strong = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "product_release",
      commentQualityScore: 100,
      citationQualityScore: 100,
    }).selectionScore;
    expect(strong).toBeCloseTo(50 + 8 + 6, 6); // gated 50 + commentMax 8 + citationMax 6

    const weak = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "product_release",
      commentQualityScore: 0,
      citationQualityScore: 0,
    }).selectionScore;
    expect(weak).toBeCloseTo(50 - 8 - 6, 6);
  });

  test("confidence below the cap floor restricts the max tier to B (open point C1)", () => {
    expect(
      computeSelectionScore({
        qualityScore: 99,
        confidenceScore: 39,
        contentType: "model_release",
        ...neutralSignals,
      }).maxLevel,
    ).toBe("B");

    expect(
      computeSelectionScore({
        qualityScore: 99,
        confidenceScore: 40,
        contentType: "model_release",
        ...neutralSignals,
      }).maxLevel,
    ).toBe("S");
  });

  test("score is clamped to [0,100] and breakdown is stamped", () => {
    const { selectionScore, breakdown } = computeSelectionScore({
      qualityScore: 0,
      confidenceScore: 100,
      contentType: "discussion",
      commentQualityScore: 0,
      citationQualityScore: 0,
    });
    expect(selectionScore).toBe(0); // gated 0 + negative bonuses, clamped
    expect(breakdown.configVersion).toBeDefined();
  });
});
