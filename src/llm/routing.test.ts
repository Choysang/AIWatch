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
  "ANTHROPIC_BASE_URL",
  "GOOGLE_BASE_URL",
  "DEEPSEEK_BASE_URL",
  "QWEN_BASE_URL",
  "OPENAI_COMPATIBLE_BASE_URL",
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

  test("anthropic + google adapters still fail closed even with key configured", async () => {
    // No default route currently targets anthropic/google (Alignment-Closeout slice
    // moved s_level_review and merge_detection onto implemented OpenAI-shape adapters),
    // but the instantiate path must still refuse to silently downgrade if someone
    // overrides a route or adds a new task pointing at these providers.
    process.env.ANTHROPIC_API_KEY = "anth-test";
    process.env.GOOGLE_API_KEY = "g-test";
    const { instantiateProvider } = await freshRouting();
    expect(instantiateProvider("anthropic")).toBeNull();
    expect(instantiateProvider("google")).toBeNull();
  });

  test("default routes for s_level_review + merge_detection resolve to a real provider", async () => {
    // Guards against silently re-routing back to anthropic/google before adapters ship.
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.DEEPSEEK_API_KEY = "ds-test";
    const { resolveProvider } = await freshRouting();
    const sLevel = resolveProvider("s_level_review");
    const merge = resolveProvider("merge_detection");
    if (!sLevel || !merge) throw new Error("expected both routes to resolve to a provider");
    // Both names live in the OpenAI-shape adapter family.
    expect(["openai", "deepseek", "qwen", "openai_compatible"]).toContain(sLevel.name);
    expect(["openai", "deepseek", "qwen", "openai_compatible"]).toContain(merge.name);
  });

  test("providerConfigured reflects env presence", async () => {
    const { providerConfigured } = await freshRouting();
    expect(providerConfigured("openai")).toBe(false);
    process.env.OPENAI_API_KEY = "x";
    expect(providerConfigured("openai")).toBe(true);
    expect(providerConfigured("stub")).toBe(true);
  });
});
