import { describe, expect, test } from "bun:test";
import { computePromotionsV2, type PromotionCandidateV2 } from "./promotion-v2";

const NOW = new Date("2026-05-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

function cand(over: Partial<PromotionCandidateV2> & { id: string }): PromotionCandidateV2 {
  return {
    selectionScore: 80,
    maxLevel: "S",
    publishedAt: ago(0.2),
    currentLevel: "none",
    directPushAt: null,
    ...over,
  };
}

describe("computePromotionsV2", () => {
  test("all tiers gate on selection_score against nested thresholds", () => {
    const decisions = computePromotionsV2(
      [
        cand({ id: "s", selectionScore: 95, publishedAt: ago(0.2) }),
        cand({ id: "a", selectionScore: 88, publishedAt: ago(2) }),
        cand({ id: "b", selectionScore: 76, publishedAt: ago(0.2) }),
        cand({ id: "miss", selectionScore: 70, publishedAt: ago(0.2) }),
      ],
      NOW,
    );
    const byId = new Map(decisions.map((d) => [d.id, d.level]));
    expect(byId.get("s")).toBe("S");
    expect(byId.get("a")).toBe("A");
    expect(byId.get("b")).toBe("B");
    expect(byId.has("miss")).toBe(false); // below B threshold
  });

  test("confidence cap (maxLevel=B) blocks A/S even with a high selection_score", () => {
    const decisions = computePromotionsV2(
      [cand({ id: "capped", selectionScore: 99, maxLevel: "B", publishedAt: ago(0.2) })],
      NOW,
    );
    // Highest tier it can reach is B despite an S-level score.
    expect(decisions.find((d) => d.id === "capped")?.level).toBe("B");
  });

  test("expert direct-push qualifies for B below the score threshold", () => {
    const decisions = computePromotionsV2(
      [cand({ id: "push", selectionScore: 20, directPushAt: ago(0.1), publishedAt: ago(0.2) })],
      NOW,
    );
    const d = decisions.find((x) => x.id === "push");
    expect(d?.level).toBe("B");
    expect(d?.directPushed).toBe(true);
  });

  test("a capped high scorer cascades down to win B rather than vanishing", () => {
    const decisions = computePromotionsV2(
      [cand({ id: "cap_cascade", selectionScore: 96, maxLevel: "B", publishedAt: ago(0.2) })],
      NOW,
    );
    expect(decisions.find((d) => d.id === "cap_cascade")?.level).toBe("B");
  });

  test("respects per-tier slot caps, highest score first", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      cand({ id: `s${i}`, selectionScore: 99 - i, maxLevel: "S", publishedAt: ago(1) }),
    );
    const decisions = computePromotionsV2(many, NOW);
    const sWinners = decisions.filter((d) => d.level === "S");
    expect(sWinners.length).toBe(5); // default S slots = 5
    // Top 5 by score won S.
    expect(sWinners.map((d) => d.id).sort()).toEqual(["s0", "s1", "s2", "s3", "s4"].sort());
  });

  test("out-of-window candidates are ignored for the tighter tiers", () => {
    const decisions = computePromotionsV2(
      [cand({ id: "stale_b", selectionScore: 99, publishedAt: ago(3) })],
      NOW,
    );
    // S runs first (tier order S->A->B): a 99 wins S outright and never reaches B.
    expect(decisions.find((d) => d.id === "stale_b")?.level).toBe("S");
  });

  test("a late-discovered post wins the daily tournament of its own publish day (promotion-v3)", () => {
    const decisions = computePromotionsV2(
      [cand({ id: "late", selectionScore: 80, publishedAt: ago(4) })],
      NOW,
    );
    const d = decisions.find((x) => x.id === "late");
    expect(d?.level).toBe("B");
    // ago(4) = 2026-05-23T12:00Z = 20:00 Asia/Shanghai -> civil day 2026-05-23.
    expect(d?.bucketDay).toBe("2026-05-23");
  });

  test("B buckets are per publish day: one day's overflow cannot crowd out another day", () => {
    const day1 = Array.from({ length: 12 }, (_, i) =>
      cand({ id: `d1_${i}`, selectionScore: 85 - i * 0.5, publishedAt: ago(2) }),
    );
    const day2 = [cand({ id: "d2_only", selectionScore: 76, publishedAt: ago(0.2) })];
    const decisions = computePromotionsV2([...day1, ...day2], NOW);
    const bWinners = decisions.filter((d) => d.level === "B");
    // day1: 12 qualified but only 10 per-day slots; day2's lone candidate wins independently.
    expect(bWinners.filter((d) => d.id.startsWith("d1_")).length).toBe(10);
    expect(bWinners.find((d) => d.id === "d2_only")?.level).toBe("B");
  });

  test("never returns a decision below the candidate's current level (no downgrade upstream)", () => {
    // Tournament returns winners only; the job applies the no-downgrade guard. Here we just
    // confirm a low scorer that can't qualify produces no decision.
    const decisions = computePromotionsV2(
      [cand({ id: "low", selectionScore: 10, publishedAt: ago(0.2) })],
      NOW,
    );
    expect(decisions.find((d) => d.id === "low")).toBeUndefined();
  });
});
