// Golden tests for the deterministic expert_value_score aggregator.

import { describe, expect, test } from "bun:test";
import { computeExpertValueScore, type ExpertAction } from "./expert-value";
import { scoringConfig } from "./config";

describe("computeExpertValueScore", () => {
  test("cold (no actions) returns expertValueNeutral", () => {
    const r = computeExpertValueScore({ actions: [] });
    expect(r.expertValueScore).toBe(scoringConfig.expertValueNeutral);
    expect(r.breakdown.cold).toBe(true);
    expect(r.breakdown.actionCount).toBe(0);
  });

  test("non-expert actions are ignored entirely", () => {
    const actions: ExpertAction[] = [
      { kind: "star", role: "user", expertWeight: 1, domainMatch: true },
      { kind: "like", role: "user", expertWeight: 5, domainMatch: true },
    ];
    const r = computeExpertValueScore({ actions });
    expect(r.expertValueScore).toBe(scoringConfig.expertValueNeutral);
    expect(r.breakdown.cold).toBe(true);
    expect(r.breakdown.actionCount).toBe(2);
  });

  test("a single non-domain expert like is a real signal above neutral", () => {
    const actions: ExpertAction[] = [
      { kind: "like", role: "expert", expertWeight: 1, domainMatch: false },
    ];
    const r = computeExpertValueScore({ actions });
    expect(r.breakdown.cold).toBe(false);
    expect(r.expertValueScore).toBeGreaterThan(0);
    expect(r.expertValueScore).toBeLessThan(60); // 1 like ≈ low signal
  });

  test("star outweighs like (3:1) and domain match doubles", () => {
    const star = computeExpertValueScore({
      actions: [{ kind: "star", role: "expert", expertWeight: 1, domainMatch: false }],
    });
    const like = computeExpertValueScore({
      actions: [{ kind: "like", role: "expert", expertWeight: 1, domainMatch: false }],
    });
    const domainStar = computeExpertValueScore({
      actions: [{ kind: "star", role: "expert", expertWeight: 1, domainMatch: true }],
    });
    expect(star.expertValueScore).toBeGreaterThan(like.expertValueScore);
    expect(domainStar.expertValueScore).toBeGreaterThan(star.expertValueScore);
  });

  test("monotone in star count (more stars => higher score)", () => {
    const make = (n: number): ExpertAction[] =>
      Array.from({ length: n }, () => ({
        kind: "star" as const,
        role: "expert",
        expertWeight: 1,
        domainMatch: true,
      }));
    const a = computeExpertValueScore({ actions: make(1) }).expertValueScore;
    const b = computeExpertValueScore({ actions: make(3) }).expertValueScore;
    const c = computeExpertValueScore({ actions: make(10) }).expertValueScore;
    expect(b).toBeGreaterThan(a);
    // Past the saturation knee both b and c can pin to 100 — non-decreasing is the
    // invariant; strict monotone is not guaranteed once saturation kicks in.
    expect(c).toBeGreaterThanOrEqual(b);
    expect(c).toBeLessThanOrEqual(100);
  });

  test("zero or negative expertWeight contributes nothing", () => {
    const r = computeExpertValueScore({
      actions: [
        { kind: "star", role: "expert", expertWeight: 0, domainMatch: true },
        { kind: "star", role: "expert", expertWeight: -1, domainMatch: true },
      ],
    });
    expect(r.expertValueScore).toBe(scoringConfig.expertValueNeutral);
    expect(r.breakdown.cold).toBe(true);
  });

  test("moderator/admin/owner also count as expert roles", () => {
    const r = computeExpertValueScore({
      actions: [
        { kind: "star", role: "moderator", expertWeight: 1, domainMatch: true },
        { kind: "star", role: "admin", expertWeight: 1, domainMatch: true },
        { kind: "star", role: "owner", expertWeight: 1, domainMatch: true },
      ],
    });
    expect(r.breakdown.cold).toBe(false);
    expect(r.expertValueScore).toBeGreaterThan(50);
  });
});
