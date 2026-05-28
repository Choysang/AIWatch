import { describe, expect, test } from "bun:test";
import { costForUsage, getPrice, KNOWN_MODEL_PRICES } from "./pricing";

describe("getPrice", () => {
  test("returns the price entry for a known (provider, model) pair", () => {
    const p = getPrice("openai", "gpt-4.1-mini");
    expect(p).toBeDefined();
    expect(p!.inputUsdPer1k).toBeGreaterThan(0);
    expect(p!.outputUsdPer1k).toBeGreaterThan(p!.inputUsdPer1k);
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
    const { llmRouting } = await import("./routing");
    for (const [task, route] of Object.entries(llmRouting)) {
      if (route.provider === "stub") continue;
      const price = getPrice(route.provider, route.model);
      if (!price) throw new Error(`missing price for ${task} (${route.provider}/${route.model})`);
    }
    // Sanity: the table isn't empty.
    expect(KNOWN_MODEL_PRICES.length).toBeGreaterThan(0);
  });
});

describe("costForUsage", () => {
  test("computes input × price + output × price, in USD", () => {
    // gpt-4.1-mini: 0.40 input / 1.60 output per 1k.
    const cost = costForUsage("openai", "gpt-4.1-mini", 1000, 500);
    // 1000 * 0.40/1000 + 500 * 1.60/1000 = 0.40 + 0.80 = 1.20
    expect(cost).toBeCloseTo(1.2, 6);
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
