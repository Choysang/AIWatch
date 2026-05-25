import { describe, expect, test } from "bun:test";
import { canTransition, nextStatus, resolveTransition } from "./review";
import type { ContributionStatus } from "./types";

describe("review.nextStatus", () => {
  test("maps each action to its resulting status", () => {
    expect(nextStatus("triage")).toBe("triaged");
    expect(nextStatus("approve")).toBe("approved");
    expect(nextStatus("reject")).toBe("rejected");
    expect(nextStatus("apply")).toBe("applied");
  });
});

describe("review.canTransition — legal moves", () => {
  const legal: [ContributionStatus, ContributionStatus][] = [
    ["submitted", "triaged"],
    ["submitted", "approved"],
    ["submitted", "rejected"],
    ["triaged", "approved"],
    ["triaged", "rejected"],
    ["approved", "applied"],
    ["approved", "rejected"],
  ];
  for (const [from, to] of legal) {
    test(`${from} -> ${to} is allowed`, () => {
      expect(canTransition(from, to)).toBe(true);
    });
  }
});

describe("review.canTransition — illegal moves", () => {
  const illegal: [ContributionStatus, ContributionStatus][] = [
    ["submitted", "applied"], // cannot skip approval
    ["triaged", "applied"], // must be approved first
    ["triaged", "triaged"], // no self-loop
    ["applied", "approved"], // terminal
    ["applied", "rejected"], // terminal
    ["rejected", "approved"], // terminal
    ["rejected", "triaged"], // terminal
  ];
  for (const [from, to] of illegal) {
    test(`${from} -> ${to} is rejected`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }

  test("rejected and applied are terminal (no outgoing transitions)", () => {
    const targets: ContributionStatus[] = ["submitted", "triaged", "approved", "rejected", "applied"];
    for (const to of targets) {
      expect(canTransition("rejected", to)).toBe(false);
      expect(canTransition("applied", to)).toBe(false);
    }
  });
});

describe("review.resolveTransition", () => {
  test("returns the new status for a legal action", () => {
    expect(resolveTransition("submitted", "triage")).toBe("triaged");
    expect(resolveTransition("triaged", "approve")).toBe("approved");
    expect(resolveTransition("approved", "apply")).toBe("applied");
    expect(resolveTransition("submitted", "reject")).toBe("rejected");
  });

  test("throws on an illegal action from the current state", () => {
    expect(() => resolveTransition("submitted", "apply")).toThrow(/illegal contribution transition/);
    expect(() => resolveTransition("applied", "approve")).toThrow(/illegal contribution transition/);
    expect(() => resolveTransition("rejected", "apply")).toThrow(/illegal contribution transition/);
  });
});
