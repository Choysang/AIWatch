import { describe, expect, test } from "bun:test";
import { computeSelectionScore } from "./selection-score";

const neutralSignals = { commentQualityScore: 50, citationQualityScore: 50 };

describe("computeSelectionScore", () => {
  test("neutral comment/citation signals add nothing; full confidence passes quality through", () => {
    const { selectionScore } = computeSelectionScore({
      qualityScore: 80,
      confidenceScore: 100,
      contentType: "news",
      ...neutralSignals,
    });
    expect(selectionScore).toBeCloseTo(80, 6);
  });

  test("zero confidence halves quality via the multiplicative gate (floor 0.5)", () => {
    const { selectionScore } = computeSelectionScore({
      qualityScore: 80,
      confidenceScore: 0,
      contentType: "news",
      ...neutralSignals,
    });
    expect(selectionScore).toBeCloseTo(40, 6);
  });

  test("content_type multiplier: opinion is penalized, release nudged up (clamped at 100)", () => {
    const opinion = computeSelectionScore({
      qualityScore: 100,
      confidenceScore: 100,
      contentType: "opinion",
      ...neutralSignals,
    }).selectionScore;
    expect(opinion).toBeCloseTo(95, 6); // 100 * 0.95

    const howto = computeSelectionScore({
      qualityScore: 80,
      confidenceScore: 100,
      contentType: "howto",
      ...neutralSignals,
    }).selectionScore;
    expect(howto).toBeCloseTo(84, 6); // 80 * 1.05 — practice content gets the release edge

    const release = computeSelectionScore({
      qualityScore: 100,
      confidenceScore: 100,
      contentType: "release",
      ...neutralSignals,
    }).selectionScore;
    expect(release).toBeCloseTo(100, 6); // 100 * 1.05 clamped to 100
  });

  test("strong comments and citations add bounded bonuses; weak ones subtract", () => {
    const strong = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "news",
      commentQualityScore: 100,
      citationQualityScore: 100,
    }).selectionScore;
    expect(strong).toBeCloseTo(50 + 8 + 6, 6); // gated 50 + commentMax 8 + citationMax 6

    const weak = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "news",
      commentQualityScore: 0,
      citationQualityScore: 0,
    }).selectionScore;
    expect(weak).toBeCloseTo(50 - 8 - 6, 6);
  });

  test("views add a small saturated selection bonus", () => {
    const base = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "news",
      viewCount: 0,
      ...neutralSignals,
    }).selectionScore;
    const viewed = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "news",
      viewCount: 200,
      ...neutralSignals,
    });
    expect(viewed.selectionScore).toBeGreaterThan(base);
    expect(viewed.breakdown.viewBonus).toBeCloseTo(4, 6);
  });

  test("text plus visible media adds a small selection bonus", () => {
    const base = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "news",
      hasTextAndMedia: false,
      ...neutralSignals,
    }).selectionScore;
    const rich = computeSelectionScore({
      qualityScore: 50,
      confidenceScore: 100,
      contentType: "news",
      hasTextAndMedia: true,
      ...neutralSignals,
    });
    expect(rich.selectionScore).toBeCloseTo(base + 4, 6);
    expect(rich.breakdown.mediaTextBonus).toBeCloseTo(4, 6);
  });

  test("confidence below the cap floor restricts the max tier to B (open point C1)", () => {
    expect(
      computeSelectionScore({
        qualityScore: 99,
        confidenceScore: 39,
        contentType: "release",
        ...neutralSignals,
      }).maxLevel,
    ).toBe("B");

    expect(
      computeSelectionScore({
        qualityScore: 99,
        confidenceScore: 40,
        contentType: "release",
        ...neutralSignals,
      }).maxLevel,
    ).toBe("S");
  });

  test("score is clamped to [0,100] and breakdown is stamped", () => {
    const { selectionScore, breakdown } = computeSelectionScore({
      qualityScore: 0,
      confidenceScore: 100,
      contentType: "opinion",
      commentQualityScore: 0,
      citationQualityScore: 0,
    });
    expect(selectionScore).toBe(0); // gated 0 + negative bonuses, clamped
    expect(breakdown.configVersion).toBeDefined();
  });
});
