// Per-task model routing (locked decision). Each task picks a provider + model; keys come
// from env. A missing key fails CLOSED for that route (Scoring Integrity slice / Phase C):
// resolveProvider returns null, and the caller marks the post `judge_failed` with reason
// `no_key`. The stub provider is selected ONLY when:
//   1. the task explicitly routes to "stub", OR
//   2. LLM_STUB_FALLBACK=1 is set (dev/demo escape hatch; OFF by default in prod).

import { OpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./provider";
import { StubLLMProvider } from "./stub";

export type LlmTask =
  | "prefilter"
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

export const routingConfigVersion = "routing-v1";

export const llmRouting: Record<LlmTask, RouteConfig> = {
  prefilter: { provider: "deepseek", model: "deepseek-chat", promptVersion: "prefilter-v1", maxInputTokens: 2000, maxOutputTokens: 200, temperature: 0 },
  cold_judge: { provider: "openai", model: "gpt-4.1-mini", promptVersion: "cold-judge-v1", maxInputTokens: 4000, maxOutputTokens: 800, temperature: 0.2 },
  comment_classification: { provider: "deepseek", model: "deepseek-chat", promptVersion: "comment-classify-v1", maxInputTokens: 6000, maxOutputTokens: 1200, temperature: 0 },
  merge_detection: { provider: "google", model: "gemini-2.5-flash", promptVersion: "merge-v1", maxInputTokens: 4000, maxOutputTokens: 400, temperature: 0 },
  s_level_review: { provider: "anthropic", model: "claude-sonnet-4-6", promptVersion: "s-review-v1", maxInputTokens: 8000, maxOutputTokens: 1500, temperature: 0.2 },
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
  return Boolean(process.env[PROVIDER_ENV[provider].key]);
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
export function resolveProvider(task: LlmTask): LLMProvider | null {
  const route = llmRouting[task];
  if (route.provider === "stub") return new StubLLMProvider();

  if (providerConfigured(route.provider)) {
    return instantiateProvider(route.provider);
  }
  if (stubFallbackEnabled()) return new StubLLMProvider();
  return null;
}

function instantiateProvider(name: Exclude<LlmProviderName, "stub">): LLMProvider | null {
  const env = PROVIDER_ENV[name];
  const apiKey = process.env[env.key];
  if (!apiKey) return null;
  const baseUrl = process.env[env.baseUrl] ?? env.defaultBaseUrl;

  switch (name) {
    case "openai":
    case "deepseek":
    case "qwen":
    case "openai_compatible": {
      if (!baseUrl) return null;
      return new OpenAICompatibleProvider({ name, baseUrl, apiKey });
    }
    // Anthropic + Google have non-OpenAI-shape APIs; their dedicated adapters land in a
    // follow-up. Returning null fails closed instead of silently downgrading to stub.
    case "anthropic":
    case "google":
      return null;
  }
}
