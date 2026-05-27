// Unit tests for the LLM routing layer.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const ENV_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "DEEPSEEK_API_KEY",
  "QWEN_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_BASE_URL",
  "LLM_STUB_FALLBACK",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function freshRouting(): Promise<typeof import("./routing")> {
  // The routing module reads process.env lazily inside resolveProvider, so a normal
  // import is enough — no need to bust the module cache.
  return import("./routing");
}

describe("resolveProvider — fail-closed semantics", () => {
  test("returns null when the route's key is missing and stub fallback is off", async () => {
    const { resolveProvider } = await freshRouting();
    expect(resolveProvider("cold_judge")).toBeNull();
  });

  test("returns the StubLLMProvider when LLM_STUB_FALLBACK=1 and no key configured", async () => {
    process.env.LLM_STUB_FALLBACK = "1";
    const { resolveProvider } = await freshRouting();
    const p = resolveProvider("cold_judge");
    expect(p).not.toBeNull();
    expect(p?.name).toBe("stub");
  });

  test("returns the real provider when the route's key is configured", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { resolveProvider } = await freshRouting();
    const p = resolveProvider("cold_judge");
    expect(p).not.toBeNull();
    expect(p?.name).toBe("openai");
  });

  test("anthropic + google routes return null today (adapter follow-up) even with key", async () => {
    process.env.ANTHROPIC_API_KEY = "anth-test";
    process.env.GOOGLE_API_KEY = "g-test";
    const { resolveProvider } = await freshRouting();
    expect(resolveProvider("s_level_review")).toBeNull();
    expect(resolveProvider("merge_detection")).toBeNull();
  });

  test("providerConfigured reflects env presence", async () => {
    const { providerConfigured } = await freshRouting();
    expect(providerConfigured("openai")).toBe(false);
    process.env.OPENAI_API_KEY = "x";
    expect(providerConfigured("openai")).toBe(true);
    expect(providerConfigured("stub")).toBe(true);
  });
});
