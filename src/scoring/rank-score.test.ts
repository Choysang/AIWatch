import { describe, expect, test } from "bun:test";
import { bandWeightsForAge, computeRankScore, rankScoreConfig } from "./rank-score";

describe("computeRankScore — pure rank-score with feedback bands", () => {
  test("zero feedback returns base_score unchanged in every band", () => {
    for (const ageHours of [0, 3, 12, 72, 24 * 30]) {
      const { rankScore, breakdown } = computeRankScore({
        baseScore: 80,
        likeCount: 0,
        starCount: 0,
        downCount: 0,
        ageHours,
      });
      expect(rankScore).toBe(80);
      expect(breakdown.likeBoost).toBe(0);
      expect(breakdown.starBoost).toBe(0);
      expect(breakdown.viewBoost).toBe(0);
      expect(breakdown.downPenalty).toBe(0);
      expect(breakdown.configVersion).toBe("rank-v3");
    }
  });

  test("band 0-6h has the smallest user-feedback boost", () => {
    // Saturated feedback: all bands at full saturation should show 0-6h smallest.
    const inputs = { baseScore: 0, likeCount: 100, starCount: 20 };
    const r0 = computeRankScore({ ...inputs, ageHours: 1 }).rankScore;
    const r1 = computeRankScore({ ...inputs, ageHours: 12 }).rankScore;
    const r2 = computeRankScore({ ...inputs, ageHours: 72 }).rankScore;
    const r3 = computeRankScore({ ...inputs, ageHours: 24 * 30 }).rankScore;
    expect(r0).toBeLessThan(r1);
    expect(r0).toBeLessThan(r2);
    expect(r0).toBeLessThan(r3);
  });

  test("band 7d+ favors stars over likes more than band 6-24h does", () => {
    // 100 likes, 0 stars
    const likesOnly1 = computeRankScore({
      baseScore: 0,
      likeCount: 100,
      starCount: 0,
      ageHours: 12, // 6-24h
    }).rankScore;
    const likesOnly2 = computeRankScore({
      baseScore: 0,
      likeCount: 100,
      starCount: 0,
      ageHours: 24 * 30, // 7d+
    }).rankScore;
    expect(likesOnly1).toBeGreaterThan(likesOnly2); // likes fade with age

    // 0 likes, 20 stars
    const starsOnly1 = computeRankScore({
      baseScore: 0,
      likeCount: 0,
      starCount: 20,
      ageHours: 12, // 6-24h
    }).rankScore;
    const starsOnly2 = computeRankScore({
      baseScore: 0,
      likeCount: 0,
      starCount: 20,
      ageHours: 24 * 30, // 7d+
    }).rankScore;
    expect(starsOnly2).toBeGreaterThan(starsOnly1); // stars grow with age
  });

  test("each band picks the correct label", () => {
    expect(bandWeightsForAge(0).label).toBe("0-6h");
    expect(bandWeightsForAge(5.999).label).toBe("0-6h");
    expect(bandWeightsForAge(6).label).toBe("6-24h");
    expect(bandWeightsForAge(23.999).label).toBe("6-24h");
    expect(bandWeightsForAge(24).label).toBe("24h-7d");
    expect(bandWeightsForAge(24 * 7 - 0.001).label).toBe("24h-7d");
    expect(bandWeightsForAge(24 * 7).label).toBe("7d+");
    expect(bandWeightsForAge(24 * 365).label).toBe("7d+");
  });

  test("negative ageHours clamps to band 0-6h", () => {
    const { breakdown } = computeRankScore({
      baseScore: 50,
      likeCount: 10,
      starCount: 0,
      ageHours: -5,
    });
    expect(breakdown.bandLabel).toBe("0-6h");
  });

  test("saturation: doubling likes beyond saturation barely adds anything", () => {
    const r1 = computeRankScore({
      baseScore: 0,
      likeCount: 100,
      starCount: 0,
      ageHours: 12,
    }).rankScore;
    const r2 = computeRankScore({
      baseScore: 0,
      likeCount: 10000,
      starCount: 0,
      ageHours: 12,
    }).rankScore;
    // 100x more likes adds at most a small amount because of log saturation.
    expect(r2 - r1).toBeLessThan(2);
  });

  test("monotone: more likes never decreases rank within a band", () => {
    const ageHours = 12;
    let prev = computeRankScore({ baseScore: 50, likeCount: 0, starCount: 0, ageHours }).rankScore;
    for (const likes of [1, 5, 10, 50, 100, 500]) {
      const r = computeRankScore({ baseScore: 50, likeCount: likes, starCount: 0, ageHours }).rankScore;
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  test("monotone: more stars never decreases rank within a band", () => {
    const ageHours = 72;
    let prev = computeRankScore({ baseScore: 50, likeCount: 0, starCount: 0, ageHours }).rankScore;
    for (const stars of [1, 2, 5, 10, 20, 100]) {
      const r = computeRankScore({ baseScore: 50, likeCount: 0, starCount: stars, ageHours }).rankScore;
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  test("monotone: more views adds a small saturated boost", () => {
    const base = computeRankScore({
      baseScore: 50,
      likeCount: 0,
      starCount: 0,
      viewCount: 0,
      ageHours: 12,
    }).rankScore;
    const viewed = computeRankScore({
      baseScore: 50,
      likeCount: 0,
      starCount: 0,
      viewCount: rankScoreConfig.viewSaturation,
      ageHours: 12,
    });
    expect(viewed.rankScore).toBeGreaterThan(base);
    expect(viewed.breakdown.viewBoost).toBeCloseTo(rankScoreConfig.viewBoost, 6);
  });

  test("rank_score floor at 0 for defensive negative base inputs", () => {
    const { rankScore } = computeRankScore({
      baseScore: -10,
      likeCount: 0,
      starCount: 0,
      ageHours: 1,
    });
    expect(rankScore).toBe(0);
  });

  test("down feedback lowers rank_score with a bounded penalty", () => {
    const baseline = computeRankScore({
      baseScore: 50,
      likeCount: 0,
      starCount: 0,
      downCount: 0,
      ageHours: 12,
    });
    const downvoted = computeRankScore({
      baseScore: 50,
      likeCount: 0,
      starCount: 0,
      downCount: rankScoreConfig.downSaturation,
      ageHours: 12,
    });
    expect(downvoted.rankScore).toBeLessThan(baseline.rankScore);
    expect(downvoted.breakdown.downPenalty).toBeCloseTo(6, 6);

    const flooded = computeRankScore({
      baseScore: 50,
      likeCount: 0,
      starCount: 0,
      downCount: 10_000,
      ageHours: 12,
    });
    expect(flooded.breakdown.downPenalty - downvoted.breakdown.downPenalty).toBeLessThan(1);
  });

  test("down feedback cannot push rank_score below zero", () => {
    const { rankScore, breakdown } = computeRankScore({
      baseScore: 2,
      likeCount: 0,
      starCount: 0,
      downCount: 10_000,
      ageHours: 72,
    });
    expect(breakdown.downPenalty).toBeGreaterThan(2);
    expect(rankScore).toBe(0);
  });

  test("breakdown reports exact boost contributions and they sum back to rank_score", () => {
    const { rankScore, breakdown } = computeRankScore({
      baseScore: 60,
      likeCount: 50,
      starCount: 8,
      downCount: 3,
      ageHours: 72, // 24h-7d band
    });
    expect(breakdown.bandLabel).toBe("24h-7d");
    const reconstructed =
      breakdown.baseScore +
      breakdown.likeBoost +
      breakdown.starBoost +
      breakdown.viewBoost -
      breakdown.downPenalty;
    expect(rankScore).toBeCloseTo(reconstructed, 9);
    expect(breakdown.likeBoost).toBeGreaterThan(0);
    expect(breakdown.starBoost).toBeGreaterThan(0);
    expect(breakdown.downPenalty).toBeGreaterThan(0);
  });

  test("max possible boost is bounded across all bands", () => {
    let maxBoost = 0;
    for (const ageHours of [1, 12, 72, 24 * 30]) {
      const { breakdown } = computeRankScore({
        baseScore: 0,
        likeCount: 1_000_000,
        starCount: 1_000_000,
        viewCount: 1_000_000,
        ageHours,
      });
      maxBoost = Math.max(maxBoost, breakdown.likeBoost + breakdown.starBoost + breakdown.viewBoost);
    }
    // Hard bound from config: max(likeBoost+starBoost) across bands.
    const configCap =
      Math.max(...rankScoreConfig.bands.map((b) => b.likeBoost + b.starBoost)) +
      rankScoreConfig.viewBoost;
    expect(maxBoost).toBeLessThanOrEqual(configCap + 0.0001);
  });
});
