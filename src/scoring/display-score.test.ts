// Golden tests for the display_score grade-floor decay function.

import { describe, expect, test } from "bun:test";
import { computeDisplayScore } from "./display-score";
import { scoringConfig } from "./config";

describe("computeDisplayScore", () => {
  test("level=none returns rounded peakScore, no decay", () => {
    const r = computeDisplayScore({ level: "none", peakScore: 73.4, ageSinceLastStrongSignalHours: 1000 });
    expect(r.displayScore).toBe(73);
    expect(r.breakdown.decayFactor).toBe(1);
  });

  test("freshly promoted B (age 0) = peakScore (rounded)", () => {
    const r = computeDisplayScore({ level: "B", peakScore: 88, ageSinceLastStrongSignalHours: 0 });
    expect(r.displayScore).toBe(88);
    expect(r.breakdown.floor).toBe(scoringConfig.gradeFloors.B);
  });

  test("after one half-life, displayScore is halfway between peak and floor", () => {
    const halfLifeHours = scoringConfig.decayHalfLifeDays.B * 24;
    const r = computeDisplayScore({
      level: "B",
      peakScore: 95,
      ageSinceLastStrongSignalHours: halfLifeHours,
    });
    // floor=75, peak=95, midpoint=85 (decay 0.5)
    expect(r.displayScore).toBe(85);
  });

  test("after many half-lives, displayScore asymptotes to the floor", () => {
    const halfLifeHours = scoringConfig.decayHalfLifeDays.A * 24;
    const r = computeDisplayScore({
      level: "A",
      peakScore: 99,
      ageSinceLastStrongSignalHours: halfLifeHours * 20,
    });
    expect(r.displayScore).toBe(scoringConfig.gradeFloors.A);
  });

  test("peakScore at-or-below floor clamps to floor", () => {
    const r = computeDisplayScore({
      level: "S",
      peakScore: 90, // below S floor of 94
      ageSinceLastStrongSignalHours: 0,
    });
    expect(r.displayScore).toBe(scoringConfig.gradeFloors.S);
  });

  test("each tier uses its own half-life (S decays slowest, B fastest)", () => {
    const oneWeek = 24 * 7;
    const b = computeDisplayScore({ level: "B", peakScore: 95, ageSinceLastStrongSignalHours: oneWeek }).breakdown.decayFactor;
    const a = computeDisplayScore({ level: "A", peakScore: 95, ageSinceLastStrongSignalHours: oneWeek }).breakdown.decayFactor;
    const s = computeDisplayScore({ level: "S", peakScore: 95, ageSinceLastStrongSignalHours: oneWeek }).breakdown.decayFactor;
    expect(b).toBeLessThan(a);
    expect(a).toBeLessThan(s);
  });

  test("negative ages are treated as 0", () => {
    const fresh = computeDisplayScore({ level: "B", peakScore: 90, ageSinceLastStrongSignalHours: 0 }).displayScore;
    const neg = computeDisplayScore({ level: "B", peakScore: 90, ageSinceLastStrongSignalHours: -10 }).displayScore;
    expect(neg).toBe(fresh);
  });

  test("breakdown is internally consistent", () => {
    const r = computeDisplayScore({
      level: "A",
      peakScore: 92,
      ageSinceLastStrongSignalHours: 48,
    });
    expect(r.breakdown.peakScore).toBe(92);
    expect(r.breakdown.floor).toBe(scoringConfig.gradeFloors.A);
    expect(r.breakdown.displayScore).toBe(r.displayScore);
    expect(r.breakdown.decayFactor).toBeGreaterThan(0);
    expect(r.breakdown.decayFactor).toBeLessThanOrEqual(1);
  });
});
