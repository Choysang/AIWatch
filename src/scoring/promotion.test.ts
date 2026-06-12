import { describe, expect, test } from "bun:test";
import { computePromotions, levelRank, type PromotionCandidate } from "./promotion";

const NOW = new Date("2026-05-24T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function candidate(over: Partial<PromotionCandidate> & { id: string }): PromotionCandidate {
  return {
    baseScore: 80,
    promotionScore: 80,
    publishedAt: ago(0.1),
    currentLevel: "none",
    ...over,
  };
}

describe("computePromotions", () => {
  test("promotes to B when base_score >= 75 within 24h", () => {
    const d = computePromotions([candidate({ id: "a", baseScore: 80, promotionScore: 60 })], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("B");
    expect(d[0]!.label).toBe("当日精选");
    expect(d[0]!.rankInWindow).toBe(1);
    expect(d[0]!.directPushed).toBeUndefined();
  });

  test("does not promote to B when base_score < 75", () => {
    const d = computePromotions([candidate({ id: "a", baseScore: 74, promotionScore: 95 })], NOW);
    // promotion_score 95 doesn't help: A/S need recency AND the candidate hasn't published
    // outside B window, but score 95 within 24h qualifies for S — that's the right behavior
    // (high promotion_score means it competes upward; B-tier just bars unscored entries).
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("S");
  });

  test("does not promote at all when both scores miss thresholds", () => {
    const d = computePromotions([candidate({ id: "a", baseScore: 74, promotionScore: 70 })], NOW);
    expect(d).toHaveLength(0);
  });

  test("expert direct-push forces B even when base_score is below 75", () => {
    const d = computePromotions([
      candidate({ id: "a", baseScore: 60, promotionScore: 60, directPushAt: ago(0.05) }),
    ], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("B");
    expect(d[0]!.directPushed).toBe(true);
  });

  test("direct-push does NOT bypass A/S thresholds", () => {
    // Direct-pushed but published 10d ago + low promotion_score: A window is 7d, S window
    // is 30d but S requires promotion_score >= 94. So it lands in B... but 10d > B window
    // (24h). Direct-push is a B-tier bypass tied to the B-tier window.
    const d = computePromotions([
      candidate({ id: "a", baseScore: 60, promotionScore: 60, publishedAt: ago(10), directPushAt: ago(10) }),
    ], NOW);
    expect(d).toHaveLength(0);
  });

  test("A tier uses promotion_score, not base_score", () => {
    // base=80 (would B-qualify), but published 3d ago (outside 24h B window).
    // promotion_score=88 inside 7d A window -> A.
    const d = computePromotions([
      candidate({ id: "a", baseScore: 80, promotionScore: 88, publishedAt: ago(3) }),
    ], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("A");
    expect(d[0]!.promotionScore).toBe(88);
  });

  test("S tier uses promotion_score, not base_score", () => {
    const d = computePromotions([
      candidate({ id: "a", baseScore: 80, promotionScore: 95, publishedAt: ago(10) }),
    ], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("S");
    expect(d[0]!.promotionScore).toBe(95);
  });

  test("S slot overflow cascades down to A", () => {
    const cands = Array.from({ length: 6 }, (_, i) =>
      candidate({ id: `s${i}`, baseScore: 99 - i, promotionScore: 99 - i, publishedAt: ago(3) }),
    );
    const d = computePromotions(cands, NOW);
    expect(d.filter((x) => x.level === "S")).toHaveLength(5);
    expect(d.filter((x) => x.level === "A")).toHaveLength(1);
    expect(d.find((x) => x.level === "A")!.id).toBe("s5");
  });

  test("B slot limit caps the number of winners", () => {
    const cands = Array.from({ length: 21 }, (_, i) =>
      candidate({
        id: `b${String(i).padStart(2, "0")}`,
        baseScore: 75 + i * 0.5,
        promotionScore: 60,
        publishedAt: ago(0.2),
      }),
    );
    const d = computePromotions(cands, NOW);
    expect(d).toHaveLength(20);
    expect(d.every((x) => x.level === "B")).toBe(true);
  });

  test("base score qualifies for B but published outside the 24h window -> no decision", () => {
    const d = computePromotions([
      candidate({ id: "a", baseScore: 80, promotionScore: 60, publishedAt: ago(2) }),
    ], NOW);
    expect(d).toHaveLength(0);
  });

  test("high promotion_score outside even the 30d S window yields nothing", () => {
    const d = computePromotions([
      candidate({ id: "a", baseScore: 99, promotionScore: 99, publishedAt: ago(40) }),
    ], NOW);
    expect(d).toHaveLength(0);
  });

  test("ties broken by recency then id (deterministic ranks)", () => {
    const cands = [
      candidate({ id: "older", baseScore: 80, promotionScore: 80, publishedAt: ago(0.5) }),
      candidate({ id: "newer", baseScore: 80, promotionScore: 80, publishedAt: ago(0.1) }),
    ];
    const d = computePromotions(cands, NOW);
    expect(d.find((x) => x.id === "newer")!.rankInWindow).toBe(1);
    expect(d.find((x) => x.id === "older")!.rankInWindow).toBe(2);
  });

  test("null publishedAt is ineligible", () => {
    const d = computePromotions([
      candidate({ id: "a", baseScore: 99, promotionScore: 99, publishedAt: null }),
    ], NOW);
    expect(d).toHaveLength(0);
  });

  test("levelRank orders none < B < A < S", () => {
    expect(levelRank("none")).toBeLessThan(levelRank("B"));
    expect(levelRank("B")).toBeLessThan(levelRank("A"));
    expect(levelRank("A")).toBeLessThan(levelRank("S"));
  });
});
