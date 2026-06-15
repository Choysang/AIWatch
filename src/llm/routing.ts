// Per-task model routing (locked decision). Each task picks a provider + model; keys come
// from env. A missing key fails CLOSED for that route (Scoring Integrity slice / Phase C):
// resolveProvider returns null, and the caller marks the post `judge_failed` with reason
// `no_key`. The stub provider is selected ONLY when:
//   1. the task explicitly routes to "stub", OR
//   2. LLM_STUB_FALLBACK=1 is set (dev/demo escape hatch; OFF by default in prod).

import { OpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./provider";
import { getRoutingOverride } from "./routing-overrides";
import { StubLLMProvider } from "./stub";

export type LlmTask =
  | "prefilter"
  | "light_judge"
  | "deep_extract"
  | "cold_judge"
  | "comment_classification"
  | "merge_detection"
  | "s_level_review";

export type LlmProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "qwen"
  | "openai_compatible"
  | "stub";

export interface RouteConfig {
  provider: LlmProviderName;
  model: string;
  promptVersion: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
}

// Routing config version: bump when ANY route's provider/model/promptVersion changes so
// downstream caches (judgments, recomputes) can detect a routing drift.
// routing-v4: dual-axis taxonomy + single-model degrade — light_judge/deep_extract share one
// provider+model (default deepseek-chat); they differ only by prompt, not by provider tier.
export const routingConfigVersion = "routing-v4";

const PROVIDERS: LlmProviderName[] = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "qwen",
  "openai_compatible",
  "stub",
];

function configuredProvider(envName: string, fallback: LlmProviderName): LlmProviderName {
  const value = process.env[envName]?.trim();
  if (!value) return fallback;
  return PROVIDERS.includes(value as LlmProviderName) ? (value as LlmProviderName) : fallback;
}

function configuredProviderChain(envNames: string[], fallback: LlmProviderName): LlmProviderName {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value && PROVIDERS.includes(value as LlmProviderName)) return value as LlmProviderName;
  }
  return fallback;
}

function configuredModel(envName: string, fallback: string): string {
  return process.env[envName]?.trim() || fallback;
}

function configuredModelChain(envNames: string[], fallback: string): string {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return fallback;
}

// Default routes only target providers with a real adapter implemented today
// (openai / deepseek / qwen / openai_compatible — all OpenAI-shape). Anthropic and
// Google remain in PROVIDER_ENV / LlmProviderName so future routes / overrides can
// adopt them once dedicated adapters land; until then `instantiateProvider` still
// fails closed for those names.
export const llmRouting: Record<LlmTask, RouteConfig> = {
  prefilter: { provider: "deepseek", model: "deepseek-chat", promptVersion: "prefilter-v1", maxInputTokens: 2000, maxOutputTokens: 200, temperature: 0 },
  // Single-model degrade (2026-06-06 design §4): triage + deep extraction share one provider
  // and model — they differ only by prompt. LLM_PROVIDER / LLM_MODEL are the canonical single
  // knobs; the per-stage (LLM_LIGHT_*/LLM_DEEP_*) and legacy LLM_NEWS_* env vars stay in the
  // chain for back-compat. Default deepseek-chat: a mid-tier model with good Chinese summaries.
  get light_judge() {
    return {
      provider: configuredProviderChain(
        ["LLM_PROVIDER", "LLM_LIGHT_PROVIDER", "LLM_NEWS_PROVIDER"],
        "deepseek",
      ),
      model: configuredModelChain(
        ["LLM_MODEL", "LLM_LIGHT_MODEL", "LLM_NEWS_MODEL"],
        "deepseek-chat",
      ),
      promptVersion: "light-judge-v3",
      maxInputTokens: 3000,
      maxOutputTokens: 300,
      temperature: 0,
    };
  },
  get deep_extract() {
    return {
      provider: configuredProviderChain(
        ["LLM_PROVIDER", "LLM_DEEP_PROVIDER", "LLM_NEWS_PROVIDER"],
        "deepseek",
      ),
      model: configuredModelChain(
        ["LLM_MODEL", "LLM_DEEP_MODEL", "LLM_NEWS_MODEL"],
        "deepseek-chat",
      ),
      promptVersion: "deep-extract-v3",
      maxInputTokens: 5000,
      maxOutputTokens: 900,
      temperature: 0.2,
    };
  },
  get cold_judge() {
    return {
      provider: configuredProvider("LLM_NEWS_PROVIDER", "openai"),
      model: configuredModel("LLM_NEWS_MODEL", "gpt-4.1-mini"),
      promptVersion: "cold-judge-v1",
      maxInputTokens: 4000,
      maxOutputTokens: 800,
      temperature: 0.2,
    };
  },
  comment_classification: { provider: "deepseek", model: "deepseek-chat", promptVersion: "comment-classify-v1", maxInputTokens: 6000, maxOutputTokens: 1200, temperature: 0 },
  // merge_detection was google/gemini-2.5-flash; route to deepseek until the Google
  // adapter ships (decision: Alignment-Closeout slice, 2026-05-28).
  merge_detection: { provider: "deepseek", model: "deepseek-chat", promptVersion: "merge-v1", maxInputTokens: 4000, maxOutputTokens: 400, temperature: 0 },
  // s_level_review was anthropic/claude-sonnet-4-6; route to openai gpt-4.1 until the
  // Anthropic adapter ships. S-tier still uses a stronger model than cold_judge.
  s_level_review: { provider: "openai", model: "gpt-4.1", promptVersion: "s-review-v1", maxInputTokens: 8000, maxOutputTokens: 1500, temperature: 0.2 },
};

interface ProviderEnv {
  /** Env var holding the API key. */
  key: string;
  /** Env var optionally overriding the base URL (lets users repoint to OpenRouter, Ollama). */
  baseUrl: string;
  /** Default base URL for the vendor. */
  defaultBaseUrl: string | null;
}

const PROVIDER_ENV: Record<Exclude<LlmProviderName, "stub">, ProviderEnv> = {
  openai: { key: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL", defaultBaseUrl: "https://api.openai.com/v1" },
  anthropic: { key: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL", defaultBaseUrl: "https://api.anthropic.com/v1" },
  google: { key: "GOOGLE_API_KEY", baseUrl: "GOOGLE_BASE_URL", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  deepseek: { key: "DEEPSEEK_API_KEY", baseUrl: "DEEPSEEK_BASE_URL", defaultBaseUrl: "https://api.deepseek.com/v1" },
  qwen: { key: "QWEN_API_KEY", baseUrl: "QWEN_BASE_URL", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  openai_compatible: { key: "OPENAI_COMPATIBLE_API_KEY", baseUrl: "OPENAI_COMPATIBLE_BASE_URL", defaultBaseUrl: null },
};

/** True when the provider has a usable key configured. */
export function providerConfigured(provider: LlmProviderName): boolean {
  if (provider === "stub") return true;
  return Boolean(process.env[PROVIDER_ENV[provider].key]?.trim());
}

/** True when stub fallback is explicitly allowed (dev/demo). Default off. */
export function stubFallbackEnabled(): boolean {
  return process.env.LLM_STUB_FALLBACK === "1";
}

/**
 * Resolve a provider for a task. Returns null when the route has no usable key AND stub
 * fallback is disabled — that's the fail-closed contract: a missing key is not a bug, but
 * it does block this route's judgments until the key is configured.
 */
/**
 * The effective route for a task: the static/env base (llmRouting) with a valid owner
 * override (v0.5 C1) applied to provider + model. The override is ignored when its provider
 * isn't a known LlmProviderName — defends the judge hot path against a stale/bad cache row,
 * so an unknown override degrades to the base rather than crashing. promptVersion / token
 * caps / temperature always come from the code-controlled base.
 */
export function getRouteConfig(task: LlmTask): RouteConfig {
  const base = llmRouting[task];
  const override = getRoutingOverride(task);
  if (override && PROVIDERS.includes(override.provider) && override.model) {
    return { ...base, provider: override.provider, model: override.model };
  }
  return base;
}

export function resolveProvider(task: LlmTask): LLMProvider | null {
  const route = getRouteConfig(task);
  if (route.provider === "stub") return new StubLLMProvider();

  if (providerConfigured(route.provider)) {
    return instantiateProvider(route.provider);
  }
  if (stubFallbackEnabled()) return new StubLLMProvider();
  return null;
}

/**
 * Exported for tests so the fail-closed contract for unimplemented adapters
 * (anthropic, google) can be asserted without depending on which tasks happen to
 * route there. Not part of the public LLM contract.
 * @internal
 */
export function instantiateProvider(
  name: Exclude<LlmProviderName, "stub">,
): LLMProvider | null {
  const env = PROVIDER_ENV[name];
  const apiKey = process.env[env.key]?.trim();
  if (!apiKey) return null;
  // Treat an empty/whitespace base-url override as "unset" and fall back to the vendor
  // default. A literal `DEEPSEEK_BASE_URL=` placeholder in .env would otherwise survive the
  // `?? default` (empty string isn't nullish) and trip the `if (!baseUrl)` guard below,
  // failing an otherwise-keyed provider closed.
  const baseUrl = process.env[env.baseUrl]?.trim() || env.defaultBaseUrl;

  switch (name) {
    case "openai":
    case "deepseek":
    case "qwen":
    case "openai_compatible": {
      if (!baseUrl) return null;
      return new OpenAICompatibleProvider({ name, baseUrl, apiKey });
    }
    // Anthropic + Google have non-OpenAI-shape APIs; their dedicated adapters land in a
    // follow-up. Returning null fails closed instead of silently downgrading to stub —
    // even though no default route currently targets these two, an env override or a
    // future route would still hit this guard.
    case "anthropic":
    case "google":
      return null;
  }
}
