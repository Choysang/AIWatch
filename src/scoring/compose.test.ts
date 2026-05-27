// Smoke tests for compose entry point — verifies the four aggregators wire together
// correctly and the peak-score ratchet behaves.

import { describe, expect, test } from "bun:test";
import { composePromotionScores } from "./compose";

describe("composePromotionScores", () => {
  test("cold (no signals) yields neutral promotion_score with cold breakdowns", () => {
    const r = composePromotionScores({
      baseScore: 80,
      expertActions: [],
      validComments: [],
      level: "none",
      priorPeakScore: null,
      ageSinceLastStrongSignalHours: 0,
    });
    // 80*0.55 + 50*0.20 + 50*0.15 + 50*0.10 = 66.5
    expect(r.promotionScore).toBeCloseTo(66.5, 5);
    expect(r.breakdown.expertValue.cold).toBe(true);
    expect(r.breakdown.commentQuality.cold).toBe(true);
    expect(r.breakdown.citationQuality.cold).toBe(true);
  });

  test("peak ratchets to max(prior, new)", () => {
    const rising = composePromotionScores({
      baseScore: 80,
      expertActions: [],
      validComments: [],
      level: "B",
      priorPeakScore: 60,
      ageSinceLastStrongSignalHours: 0,
    });
    expect(rising.peakScore).toBe(rising.promotionScore); // 66.5 > 60
    expect(rising.peakScore).toBeGreaterThan(60);

    const falling = composePromotionScores({
      baseScore: 70,
      expertActions: [],
      validComments: [],
      level: "B",
      priorPeakScore: 90,
      ageSinceLastStrongSignalHours: 0,
    });
    expect(falling.peakScore).toBe(90); // peak holds even if current is lower
  });

  test("strong signals raise promotion + display together", () => {
    const r = composePromotionScores({
      baseScore: 80,
      expertActions: [
        { kind: "star", role: "expert", expertWeight: 1.5, domainMatch: true },
        { kind: "star", role: "moderator", expertWeight: 1, domainMatch: false },
      ],
      validComments: [
        { category: "criticism", isExpert: true },
        { category: "handson", isExpert: true },
        { category: "supplement", isExpert: false },
      ],
      level: "B",
      priorPeakScore: null,
      ageSinceLastStrongSignalHours: 0,
    });
    expect(r.breakdown.expertValue.cold).toBe(false);
    expect(r.breakdown.commentQuality.cold).toBe(false);
    expect(r.promotionScore).toBeGreaterThan(66.5);
    expect(r.displayScore).toBeGreaterThanOrEqual(75);
  });

  test("display decays toward floor for stale B-tier", () => {
    const fresh = composePromotionScores({
      baseScore: 80,
      expertActions: [],
      validComments: [],
      level: "B",
      priorPeakScore: 92,
      ageSinceLastStrongSignalHours: 0,
    });
    const stale = composePromotionScores({
      baseScore: 80,
      expertActions: [],
      validComments: [],
      level: "B",
      priorPeakScore: 92,
      ageSinceLastStrongSignalHours: 24 * 30, // 30 days; B half-life is 3d
    });
    expect(stale.displayScore).toBeLessThan(fresh.displayScore);
    expect(stale.displayScore).toBeGreaterThanOrEqual(75); // never below floor
  });
});
