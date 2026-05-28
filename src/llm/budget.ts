// Budget classification helpers for spend_guard. Pure functions only — the LLM call
// path reads env caps + a month-to-date sum (computed elsewhere, against the ledger
// table that lands in phase C) and consults classifySpend() to decide whether to
// proceed, warn, or fail closed.
//
// Bands per spec §9 (build-delivery doc):
//   < 80% of cap     -> "ok"     proceed
//   ≥ 80% and < 100% -> "warn"   shed optional work (deep citation, comment follow-ups)
//   ≥ 100%           -> "block"  fail closed for paid connectors + non-critical LLM
//
// A cap ≤ 0 is treated as "budget disabled" — never block. This keeps a fresh install
// (no env vars set) functional without forcing operators to opt out explicitly.

export type SpendStatus = "ok" | "warn" | "block";

export interface BudgetCaps {
  /** USD cap per calendar month for LLM spend. 0 = disabled. */
  llmUsd: number;
  /** USD cap per calendar month for paid X API spend. 0 = disabled. */
  xApiUsd: number;
}

const WARN_RATIO = 0.8;
const BLOCK_RATIO = 1.0;

function parseUsdEnv(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export function readBudgetCaps(): BudgetCaps {
  return {
    llmUsd: parseUsdEnv(process.env.MAX_MONTHLY_LLM_USD),
    xApiUsd: parseUsdEnv(process.env.MAX_MONTHLY_X_API_USD),
  };
}

export function classifySpend(usd: number, capUsd: number): SpendStatus {
  // Corrupt usd reading (NaN, Infinity) must not coast — treat as exceeded.
  if (!Number.isFinite(usd)) return "block";
  // Cap ≤ 0 means "no budget configured"; never block.
  if (capUsd <= 0) return "ok";
  if (usd >= capUsd * BLOCK_RATIO) return "block";
  if (usd >= capUsd * WARN_RATIO) return "warn";
  return "ok";
}

/**
 * UTC-month bucket key, e.g. "2026-05". Used as the ledger row's partition so the
 * month-to-date sum is a single indexed range scan. UTC, not APP_TZ — billing windows
 * are vendor-defined and never align with APP_TZ; UTC is what the receipts use.
 */
export function yyyyMmForDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
