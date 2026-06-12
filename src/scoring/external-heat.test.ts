import { describe, expect, test } from "bun:test";
import { scoringConfig } from "./config";
import { externalHeatScore } from "./external-heat";

describe("externalHeatScore", () => {
  test("returns 0 when metrics are missing or empty", () => {
    expect(externalHeatScore(null, "x")).toBe(0);
    expect(externalHeatScore(undefined, "github")).toBe(0);
    expect(externalHeatScore({}, "x")).toBe(0);
  });

  test("is monotonic in raw engagement", () => {
    const low = externalHeatScore({ likes: 10 }, "x");
    const high = externalHeatScore({ likes: 1000 }, "x");
    expect(high).toBeGreaterThan(low);
  });

  test("approaches but does not exceed 100 far past saturation", () => {
    const sat = scoringConfig.externalHeat.platformSaturation.x!;
    const score = externalHeatScore({ likes: sat * 100 }, "x");
    expect(score).toBeGreaterThan(95);
    expect(score).toBeLessThanOrEqual(100);
  });

  test("unknown platform falls back to default saturation", () => {
    // "rss" has no explicit saturation -> default (1000); differs from x (5000).
    const onX = externalHeatScore({ likes: 1000 }, "x");
    const onUnknown = externalHeatScore({ likes: 1000 }, "rss");
    expect(onUnknown).toBe(100); // heat_raw 1000 == default saturation 1000
    expect(onX).toBeLessThan(onUnknown);
  });

  test("stays within [0, 100]", () => {
    const s = externalHeatScore(
      { likes: 1, reposts: 1, replies: 1, stars: 1, comments: 1 },
      "github",
    );
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
