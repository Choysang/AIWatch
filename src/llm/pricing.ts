// Model pricing table for spend_guard (USD per 1M tokens — the unit every vendor's
// public pricing page now quotes). Source-of-truth is the vendor's pricing page at the
// date stamped below — bump the table when prices move. costForUsage() is the pure
// function the LLM call path uses to write to the spend ledger; it returns null for
// unpriced models so the caller can decide whether to fail closed or run uncharged
// (current policy: log + skip the ledger row, don't crash).

import type { LlmProviderName } from "./routing";

export interface ModelPrice {
  provider: LlmProviderName;
  /** Canonical lowercase model id; lookups are case-insensitive. */
  model: string;
  /** USD per 1,000,000 input tokens (vendor list price). */
  inputUsdPer1m: number;
  /** USD per 1,000,000 output tokens (vendor list price). */
  outputUsdPer1m: number;
}

// Snapshot date: 2026-05-28. Prices are USD per 1M tokens, as quoted by each vendor.
// Update with the provider when a route changes.
export const KNOWN_MODEL_PRICES: readonly ModelPrice[] = [
  // OpenAI
  { provider: "openai", model: "gpt-4.1", inputUsdPer1m: 2.0, outputUsdPer1m: 8.0 },
  { provider: "openai", model: "gpt-4.1-mini", inputUsdPer1m: 0.4, outputUsdPer1m: 1.6 },
  { provider: "openai", model: "gpt-4o", inputUsdPer1m: 2.5, outputUsdPer1m: 10.0 },
  { provider: "openai", model: "gpt-4o-mini", inputUsdPer1m: 0.15, outputUsdPer1m: 0.6 },
  // DeepSeek (chat tier)
  { provider: "deepseek", model: "deepseek-chat", inputUsdPer1m: 0.27, outputUsdPer1m: 1.1 },
  // Qwen / DashScope (compatible-mode flagship chat tier)
  { provider: "qwen", model: "qwen-plus", inputUsdPer1m: 0.4, outputUsdPer1m: 1.2 },
  { provider: "qwen", model: "qwen-max", inputUsdPer1m: 2.4, outputUsdPer1m: 9.6 },
  // SiliconFlow via openai_compatible (prod single-model routing; snapshot 2026-06-12)
  { provider: "openai_compatible", model: "pro/moonshotai/kimi-k2.6", inputUsdPer1m: 0.95, outputUsdPer1m: 4.0 },
  { provider: "openai_compatible", model: "moonshotai/kimi-k2.6", inputUsdPer1m: 0.95, outputUsdPer1m: 4.0 },
] as const;

// Indexed by `${provider}::${model.toLowerCase()}` for O(1) case-insensitive lookup.
const PRICE_INDEX: Map<string, ModelPrice> = new Map(
  KNOWN_MODEL_PRICES.map((p) => [`${p.provider}::${p.model.toLowerCase()}`, p]),
);

function priceKey(provider: LlmProviderName, model: string): string {
  return `${provider}::${model.toLowerCase()}`;
}

/** Look up a price entry. Case-insensitive on the model id. */
export function getPrice(provider: LlmProviderName, model: string): ModelPrice | undefined {
  return PRICE_INDEX.get(priceKey(provider, model));
}

/**
 * Compute USD cost for one call's token usage. Returns null when the model has no
 * price entry so the caller can decide policy (current: skip ledger row but don't
 * crash — a missing entry is a config gap, not a runtime bug).
 *
 * Negative token counts are clamped to zero so a malformed `usage` block from an
 * upstream provider can't accidentally credit the ledger.
 */
export function costForUsage(
  provider: LlmProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = getPrice(provider, model);
  if (!price) return null;
  const inp = Math.max(0, inputTokens);
  const out = Math.max(0, outputTokens);
  const PER_MILLION = 1_000_000;
  return (inp * price.inputUsdPer1m) / PER_MILLION + (out * price.outputUsdPer1m) / PER_MILLION;
}
