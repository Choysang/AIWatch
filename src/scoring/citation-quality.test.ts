// Golden tests for the citation_quality_score aggregator.
// V1 has no citation data; the zero-input path is therefore the dominant case.

import { describe, expect, test } from "bun:test";
import { computeCitationQualityScore } from "./citation-quality";
import { scoringConfig } from "./config";

describe("computeCitationQualityScore", () => {
  test("no citations => neutral baseline (cold)", () => {
    const r = computeCitationQualityScore();
    expect(r.citationQualityScore).toBe(scoringConfig.citationQualityNeutral);
    expect(r.breakdown.cold).toBe(true);
    expect(r.breakdown.citationCount).toBe(0);
  });

  test("explicit empty array also returns neutral baseline", () => {
    const r = computeCitationQualityScore({ citations: [] });
    expect(r.citationQualityScore).toBe(scoringConfig.citationQualityNeutral);
    expect(r.breakdown.cold).toBe(true);
  });

  test("first-party citation outweighs non-first-party", () => {
    const firstParty = computeCitationQualityScore({
      citations: [{ firstParty: true, ageHours: 1 }],
    });
    const other = computeCitationQualityScore({
      citations: [{ firstParty: false, ageHours: 1 }],
    });
    expect(firstParty.citationQualityScore).toBeGreaterThan(other.citationQualityScore);
    expect(firstParty.breakdown.cold).toBe(false);
  });

  test("stale citations (>14d) contribute zero", () => {
    const fresh = computeCitationQualityScore({
      citations: [{ firstParty: true, ageHours: 1 }],
    }).citationQualityScore;
    const stale = computeCitationQualityScore({
      citations: [{ firstParty: true, ageHours: 24 * 30 }],
    }).citationQualityScore;
    expect(stale).toBeLessThan(fresh);
    expect(stale).toBe(0);
  });

  test("score saturates near 100 with many first-party citations", () => {
    const many = Array.from({ length: 20 }, () => ({ firstParty: true, ageHours: 1 }));
    const r = computeCitationQualityScore({ citations: many });
    expect(r.citationQualityScore).toBeLessThanOrEqual(100);
    expect(r.citationQualityScore).toBeGreaterThan(80);
  });
});
