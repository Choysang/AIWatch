import { describe, expect, test } from "bun:test";
import { computePromotions, levelRank, type PromotionCandidate } from "./promotion";

const NOW = new Date("2026-05-24T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function candidate(over: Partial<PromotionCandidate> & { id: string }): PromotionCandidate {
  return {
    promotionScore: 80,
    publishedAt: ago(0.1),
    currentLevel: "none",
    ...over,
  };
}

describe("computePromotions", () => {
  test("promotes to B when score >= 75 within 24h", () => {
    const d = computePromotions([candidate({ id: "a", promotionScore: 80 })], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("B");
    expect(d[0]!.label).toBe("当日精选");
    expect(d[0]!.rankInWindow).toBe(1);
  });

  test("does not promote below the B threshold", () => {
    const d = computePromotions([candidate({ id: "a", promotionScore: 74 })], NOW);
    expect(d).toHaveLength(0);
  });

  test("promotes to S when score >= 94 within 30 days", () => {
    const d = computePromotions([candidate({ id: "a", promotionScore: 95, publishedAt: ago(10) })], NOW);
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe("S");
  });

  test("S slot overflow cascades down to A", () => {
    // 6 strong, recent candidates; only 5 S slots -> 5 S + 1 A (still within the 7d A window).
    const cands = Array.from({ length: 6 }, (_, i) =>
      candidate({ id: `s${i}`, promotionScore: 99 - i, publishedAt: ago(3) }),
    );
    const d = computePromotions(cands, NOW);
    const levels = d.map((x) => x.level).sort();
    expect(d.filter((x) => x.level === "S")).toHaveLength(5);
    expect(d.filter((x) => x.level === "A")).toHaveLength(1);
    expect(levels).toEqual(["A", "S", "S", "S", "S", "S"]);
    // The lowest scorer (s5=94) is the one that cascaded to A.
    expect(d.find((x) => x.level === "A")!.id).toBe("s5");
  });

  test("B slot limit caps the number of winners", () => {
    // 21 B-only candidates (75..) -> top 20 by score become B, 1 misses out.
    const cands = Array.from({ length: 21 }, (_, i) =>
      candidate({ id: `b${String(i).padStart(2, "0")}`, promotionScore: 75 + i * 0.5, publishedAt: ago(0.2) }),
    );
    const d = computePromotions(cands, NOW);
    expect(d).toHaveLength(20);
    expect(d.every((x) => x.level === "B")).toBe(true);
  });

  test("score qualifies for A but published outside the 7d window -> no decision", () => {
    // score 90 (>=86 A, <94 S), published 10d ago: outside A(7d) and B(1d); not S(score). None.
    const d = computePromotions([candidate({ id: "a", promotionScore: 90, publishedAt: ago(10) })], NOW);
    expect(d).toHaveLength(0);
  });

  test("high score outside even the 30d S window yields nothing", () => {
    const d = computePromotions([candidate({ id: "a", promotionScore: 99, publishedAt: ago(40) })], NOW);
    expect(d).toHaveLength(0);
  });

  test("ties broken by recency then id (deterministic ranks)", () => {
    const cands = [
      candidate({ id: "older", promotionScore: 80, publishedAt: ago(0.5) }),
      candidate({ id: "newer", promotionScore: 80, publishedAt: ago(0.1) }),
    ];
    const d = computePromotions(cands, NOW);
    expect(d.find((x) => x.id === "newer")!.rankInWindow).toBe(1);
    expect(d.find((x) => x.id === "older")!.rankInWindow).toBe(2);
  });

  test("null publishedAt is ineligible", () => {
    const d = computePromotions([candidate({ id: "a", promotionScore: 99, publishedAt: null })], NOW);
    expect(d).toHaveLength(0);
  });

  test("levelRank orders none < B < A < S", () => {
    expect(levelRank("none")).toBeLessThan(levelRank("B"));
    expect(levelRank("B")).toBeLessThan(levelRank("A"));
    expect(levelRank("A")).toBeLessThan(levelRank("S"));
  });
});
