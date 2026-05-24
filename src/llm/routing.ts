// Per-task model routing (locked decision). Config references a provider; keys come
// from env. A missing key fails closed FOR THAT ROUTE ONLY. Slice 0 falls back to the
// stub provider when a route's real provider/key is unavailable, so the demo runs keyless.

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

const PROVIDER_ENV_KEY: Record<Exclude<LlmProviderName, "stub">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "QWEN_API_KEY",
  openai_compatible: "OPENAI_COMPATIBLE_API_KEY",
};

/** True when the provider has a usable key configured. */
export function providerConfigured(provider: LlmProviderName): boolean {
  if (provider === "stub") return true;
  return Boolean(process.env[PROVIDER_ENV_KEY[provider]]);
}

/**
 * Resolve a provider for a task. Slice 0: real adapters are not wired yet, so this
 * returns the stub. Once real adapters land it returns the configured provider and
 * falls back to stub only when the route's key is missing (fail closed per route).
 */
export function resolveProvider(_task: LlmTask): LLMProvider {
  // TODO(judge-slice): instantiate the real provider when providerConfigured(route.provider).
  return new StubLLMProvider();
}
