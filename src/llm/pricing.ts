// Model pricing table for spend_guard (USD per 1k tokens). Source-of-truth is the
// vendor's public pricing page at the date stamped below — bump the table when prices
// move. costForUsage() is the pure function the LLM call path will use to write to the
// spend ledger; it returns null for unpriced models so the caller can decide whether to
// fail closed or run uncharged (current policy: log + skip the ledger row, don't crash).

import type { LlmProviderName } from "./routing";

export interface ModelPrice {
  provider: LlmProviderName;
  /** Canonical lowercase model id; lookups are case-insensitive. */
  model: string;
  inputUsdPer1k: number;
  outputUsdPer1k: number;
}

// Snapshot date: 2026-05-28. Update with the provider when a route changes.
export const KNOWN_MODEL_PRICES: readonly ModelPrice[] = [
  // OpenAI
  { provider: "openai", model: "gpt-4.1", inputUsdPer1k: 2.0, outputUsdPer1k: 8.0 },
  { provider: "openai", model: "gpt-4.1-mini", inputUsdPer1k: 0.4, outputUsdPer1k: 1.6 },
  { provider: "openai", model: "gpt-4o", inputUsdPer1k: 2.5, outputUsdPer1k: 10.0 },
  { provider: "openai", model: "gpt-4o-mini", inputUsdPer1k: 0.15, outputUsdPer1k: 0.6 },
  // DeepSeek (chat tier)
  { provider: "deepseek", model: "deepseek-chat", inputUsdPer1k: 0.27, outputUsdPer1k: 1.1 },
  // Qwen / DashScope (compatible-mode flagship chat tier)
  { provider: "qwen", model: "qwen-plus", inputUsdPer1k: 0.4, outputUsdPer1k: 1.2 },
  { provider: "qwen", model: "qwen-max", inputUsdPer1k: 2.4, outputUsdPer1k: 9.6 },
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
  return (inp * price.inputUsdPer1k) / 1000 + (out * price.outputUsdPer1k) / 1000;
}
