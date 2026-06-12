// One-time runner: re-derive the dual-axis taxonomy (domain + content_type) for events whose
// domain is missing or still holds a legacy value the 0021 migration could only best-effort map.
// Usage: bun run scripts/backfill-domain-content-type.ts [limit]
// Honors spend_guard and fails closed (no provider / budget exhausted -> stops). Safe to re-run.

import { backfillDomainContentType } from "@/pipeline/backfill-domain-content-type";
import { pool } from "@/db/client";

async function main(): Promise<void> {
  const limitArg = Number(process.argv[2]);
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.trunc(limitArg) : undefined;

  const summary = await backfillDomainContentType({ limit });
  // eslint-disable-next-line no-console -- CLI script output
  console.log("[backfill-domain-content-type]", JSON.stringify(summary));
  if (summary.noProvider) {
    // eslint-disable-next-line no-console
    console.warn("No light_judge provider configured — set an API key (or LLM_STUB_FALLBACK=1).");
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
