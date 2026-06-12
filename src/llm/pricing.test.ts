import { describe, expect, test } from "bun:test";
import { costForUsage, getPrice, KNOWN_MODEL_PRICES } from "./pricing";

describe("getPrice", () => {
  test("returns the price entry for a known (provider, model) pair", () => {
    const p = getPrice("openai", "gpt-4.1-mini");
    expect(p).toBeDefined();
    expect(p!.inputUsdPer1m).toBeGreaterThan(0);
    expect(p!.outputUsdPer1m).toBeGreaterThan(p!.inputUsdPer1m);
  });

  test("is case-insensitive on the model id", () => {
    expect(getPrice("openai", "GPT-4.1-Mini")).toEqual(getPrice("openai", "gpt-4.1-mini"));
  });

  test("returns undefined for an unpriced model so the caller can decide policy", () => {
    expect(getPrice("openai", "not-a-real-model")).toBeUndefined();
  });

  test("KNOWN_MODEL_PRICES covers every default route in routing.ts", async () => {
    // Soft coupling: if a default route is ever pointed at a model with no price,
    // this test fails so spend_guard can't silently miss it.
    const savedProvider = process.env.LLM_NEWS_PROVIDER;
    const savedModel = process.env.LLM_NEWS_MODEL;
    delete process.env.LLM_NEWS_PROVIDER;
    delete process.env.LLM_NEWS_MODEL;
    const { llmRouting } = await import("./routing");
    try {
      for (const [task, route] of Object.entries(llmRouting)) {
        if (route.provider === "stub") continue;
        const price = getPrice(route.provider, route.model);
        if (!price) throw new Error(`missing price for ${task} (${route.provider}/${route.model})`);
      }
    } finally {
      if (savedProvider === undefined) delete process.env.LLM_NEWS_PROVIDER;
      else process.env.LLM_NEWS_PROVIDER = savedProvider;
      if (savedModel === undefined) delete process.env.LLM_NEWS_MODEL;
      else process.env.LLM_NEWS_MODEL = savedModel;
    }
    // Sanity: the table isn't empty.
    expect(KNOWN_MODEL_PRICES.length).toBeGreaterThan(0);
  });
});

describe("costForUsage", () => {
  test("computes input × price + output × price, in USD (prices are per 1M tokens)", () => {
    // gpt-4.1-mini: $0.40 input / $1.60 output per 1M tokens.
    const cost = costForUsage("openai", "gpt-4.1-mini", 1000, 500);
    // 1000 * 0.40/1e6 + 500 * 1.60/1e6 = 0.0004 + 0.0008 = 0.0012
    expect(cost).toBeCloseTo(0.0012, 9);
  });

  test("a realistic cold_judge call costs cents, not dollars (regression: the per-1k/per-1M unit bug)", () => {
    // ~2k input + 600 output on gpt-4.1-mini must land in fractions of a cent — the old
    // /1000 math reported ~$1.76 for this, which would trip a $50 monthly cap in ~28 calls.
    const cost = costForUsage("openai", "gpt-4.1-mini", 2000, 600)!;
    expect(cost).toBeCloseTo(2000 * 0.4e-6 + 600 * 1.6e-6, 9); // = 0.00176
    expect(cost).toBeLessThan(0.01);
  });

  test("returns 0 when both token counts are zero", () => {
    expect(costForUsage("openai", "gpt-4.1-mini", 0, 0)).toBe(0);
  });

  test("returns null for an unpriced model (caller decides whether to block or coast)", () => {
    expect(costForUsage("openai", "not-a-real-model", 100, 100)).toBeNull();
  });

  test("clamps negative token counts to zero so a malformed upstream usage block can't credit the ledger", () => {
    // Defense in depth: providers occasionally emit -1 for "unknown" — treat as zero.
    expect(costForUsage("openai", "gpt-4.1-mini", -50, -10)).toBe(0);
  });
});
