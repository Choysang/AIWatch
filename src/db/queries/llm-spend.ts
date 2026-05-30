// spend_guard ledger access (phase C). Writes one append-only receipt per priced LLM
// call and answers the month-to-date question the budget gate asks before each call.
//
// Split into a thin DB layer (here) so the deterministic pieces stay pure and unit-tested
// elsewhere: cost math lives in pricing.ts, the ok/warn/block bands in budget.ts. This
// module only persists rows and sums them.

import { eq, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { llmSpendLedger } from "@/db/schema";
import { classifySpend, yyyyMmForDate, type SpendStatus } from "@/llm/budget";
import { costForUsage } from "@/llm/pricing";
import type { LlmProviderName, LlmTask } from "@/llm/routing";
import type { TokenUsage } from "@/llm/provider";

export interface SpendEntry {
  task: LlmTask;
  provider: LlmProviderName;
  model: string;
  usage: TokenUsage;
}

/**
 * Record one priced LLM call. Returns the cost written, or null when the model has no
 * price entry (we don't fabricate a cost — an unpriced model is a config gap, logged by
 * the caller, not a ledger row). The row's month_key is derived from `now` (UTC).
 */
export async function recordLlmSpend(
  entry: SpendEntry,
  db: DB = defaultDb,
  now: Date = new Date(),
): Promise<number | null> {
  const costUsd = costForUsage(entry.provider, entry.model, entry.usage.inputTokens, entry.usage.outputTokens);
  if (costUsd === null) return null;
  await db.insert(llmSpendLedger).values({
    id: newId("spd"),
    monthKey: yyyyMmForDate(now),
    task: entry.task,
    provider: entry.provider,
    modelId: entry.model,
    inputTokens: Math.max(0, Math.trunc(entry.usage.inputTokens)),
    outputTokens: Math.max(0, Math.trunc(entry.usage.outputTokens)),
    costUsd,
  });
  return costUsd;
}

/** Sum of cost_usd for the given UTC month (defaults to the current month). */
export async function monthToDateLlmSpend(
  db: DB = defaultDb,
  now: Date = new Date(),
): Promise<number> {
  const monthKey = yyyyMmForDate(now);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${llmSpendLedger.costUsd}), 0)` })
    .from(llmSpendLedger)
    .where(eq(llmSpendLedger.monthKey, monthKey));
  // sum() over double precision comes back as a string from pg; coerce defensively.
  return Number(rows[0]?.total ?? 0);
}

/**
 * The budget gate the LLM call path consults before a paid call. Returns "ok" when the
 * cap is disabled (cap ≤ 0) without touching the DB. Otherwise reads the month-to-date
 * sum and classifies it. A failed read is NOT silently treated as "ok" — classifySpend
 * blocks on a non-finite total, and we let a thrown DB error propagate to the caller,
 * which fails the call closed (judge_failed) rather than spending blind.
 */
export async function checkLlmBudget(
  capUsd: number,
  db: DB = defaultDb,
  now: Date = new Date(),
): Promise<{ status: SpendStatus; monthToDateUsd: number }> {
  if (capUsd <= 0) return { status: "ok", monthToDateUsd: 0 };
  const monthToDateUsd = await monthToDateLlmSpend(db, now);
  return { status: classifySpend(monthToDateUsd, capUsd), monthToDateUsd };
}
