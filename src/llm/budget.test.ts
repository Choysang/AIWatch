import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { classifySpend, readBudgetCaps, yyyyMmForDate } from "./budget";

describe("classifySpend", () => {
  test("ok below 80% of cap", () => {
    expect(classifySpend(0, 50)).toBe("ok");
    expect(classifySpend(39.99, 50)).toBe("ok");
  });

  test("warn at or above 80% but below 100%", () => {
    expect(classifySpend(40, 50)).toBe("warn"); // exactly 80%
    expect(classifySpend(49.99, 50)).toBe("warn");
  });

  test("block at or above 100% of cap", () => {
    expect(classifySpend(50, 50)).toBe("block"); // boundary is inclusive (100% triggers fail-closed)
    expect(classifySpend(999, 50)).toBe("block");
  });

  test("ok when cap is 0 (budget disabled — no caps configured)", () => {
    // Cap of 0 = "no budget set"; never block. Distinct from a very tight cap.
    expect(classifySpend(100, 0)).toBe("ok");
  });

  test("ok when cap is negative (treated as disabled)", () => {
    expect(classifySpend(100, -1)).toBe("ok");
  });

  test("treats NaN / non-finite usd as block (defense in depth — corrupt ledger reads must not coast)", () => {
    expect(classifySpend(Number.NaN, 50)).toBe("block");
    expect(classifySpend(Number.POSITIVE_INFINITY, 50)).toBe("block");
  });
});

describe("readBudgetCaps", () => {
  const originalLlm = process.env.MAX_MONTHLY_LLM_USD;
  const originalX = process.env.MAX_MONTHLY_X_API_USD;
  beforeEach(() => {
    delete process.env.MAX_MONTHLY_LLM_USD;
    delete process.env.MAX_MONTHLY_X_API_USD;
  });
  afterEach(() => {
    if (originalLlm === undefined) delete process.env.MAX_MONTHLY_LLM_USD;
    else process.env.MAX_MONTHLY_LLM_USD = originalLlm;
    if (originalX === undefined) delete process.env.MAX_MONTHLY_X_API_USD;
    else process.env.MAX_MONTHLY_X_API_USD = originalX;
  });

  test("defaults both caps to 0 (disabled) when env unset — never silently block on a fresh install", () => {
    expect(readBudgetCaps()).toEqual({ llmUsd: 0, xApiUsd: 0 });
  });

  test("parses positive numerics", () => {
    process.env.MAX_MONTHLY_LLM_USD = "50";
    process.env.MAX_MONTHLY_X_API_USD = "10.5";
    expect(readBudgetCaps()).toEqual({ llmUsd: 50, xApiUsd: 10.5 });
  });

  test("clamps non-numeric or negative envs to 0 (disabled) — never crash startup over a typo", () => {
    process.env.MAX_MONTHLY_LLM_USD = "not-a-number";
    process.env.MAX_MONTHLY_X_API_USD = "-5";
    expect(readBudgetCaps()).toEqual({ llmUsd: 0, xApiUsd: 0 });
  });
});

describe("yyyyMmForDate", () => {
  test("formats UTC month as YYYY-MM regardless of locale", () => {
    expect(yyyyMmForDate(new Date("2026-05-28T15:30:00Z"))).toBe("2026-05");
    expect(yyyyMmForDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(yyyyMmForDate(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});
