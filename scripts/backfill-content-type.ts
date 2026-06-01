// One-time runner: classify legacy events (content_type IS NULL) via the cold_judge route.
// Usage: bun run scripts/backfill-content-type.ts [limit]
// Honors spend_guard and fails closed (no provider / budget exhausted -> stops, leaves NULL).
// Safe to re-run: it only ever touches rows still missing a content_type.

import { backfillContentType } from "@/pipeline/backfill-content-type";
import { pool } from "@/db/client";

async function main(): Promise<void> {
  const limitArg = Number(process.argv[2]);
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.trunc(limitArg) : undefined;

  const summary = await backfillContentType({ limit });
  // eslint-disable-next-line no-console -- CLI script output
  console.log("[backfill-content-type]", JSON.stringify(summary));
  if (summary.noProvider) {
    // eslint-disable-next-line no-console
    console.warn("No cold_judge provider configured — set an API key (or LLM_STUB_FALLBACK=1).");
  }
  if (summary.budgetStopped) {
    // eslint-disable-next-line no-console
    console.warn("Stopped: monthly LLM budget exhausted. Raise MAX_MONTHLY_LLM_USD and re-run.");
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
