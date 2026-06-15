import { afterEach, describe, expect, test } from "bun:test";
import { getRouteConfig, llmRouting, resolveProvider, type LlmTask } from "./routing";
import { clearRoutingOverridesCache, setRoutingOverrides, type RoutingOverride } from "./routing-overrides";

afterEach(() => clearRoutingOverridesCache());

function overrides(entries: [LlmTask, RoutingOverride][]): void {
  setRoutingOverrides(new Map(entries));
}

describe("getRouteConfig with overrides (v0.5 C1)", () => {
  test("no override returns the static/env base", () => {
    clearRoutingOverridesCache();
    expect(getRouteConfig("prefilter")).toEqual(llmRouting.prefilter);
  });

  test("a valid override replaces provider + model only, keeping the code-controlled fields", () => {
    overrides([["prefilter", { provider: "openai", model: "gpt-4.1-mini" }]]);
    const route = getRouteConfig("prefilter");
    expect(route.provider).toBe("openai");
    expect(route.model).toBe("gpt-4.1-mini");
    expect(route.promptVersion).toBe(llmRouting.prefilter.promptVersion);
    expect(route.maxInputTokens).toBe(llmRouting.prefilter.maxInputTokens);
    expect(route.temperature).toBe(llmRouting.prefilter.temperature);
  });

  test("an override with an unknown provider is ignored (falls back to base, defends hot path)", () => {
    overrides([["prefilter", { provider: "bogus" as unknown as RoutingOverride["provider"], model: "x" }]]);
    expect(getRouteConfig("prefilter").provider).toBe(llmRouting.prefilter.provider);
  });

  test("resolveProvider follows an override (here, to stub) — proving it reads getRouteConfig", () => {
    overrides([["prefilter", { provider: "stub", model: "stub" }]]);
    expect(resolveProvider("prefilter")?.name).toBe("stub");
  });
});
