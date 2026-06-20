// Re-judge posts stuck in judge_failed (manual full sweep). The crawl pipeline marks a post
// judge_failed when the LLM step errors (schema_invalid / provider_error / unknown) and never
// retries it; this re-runs the same judge→fold/create path in place (no row deletion).
//
//   bun run scripts/rejudge-failed-posts.ts             # retry schema_invalid + provider_error + unknown
//   bun run scripts/rejudge-failed-posts.ts --hours 12  # only failures from the last 12h
//   bun run scripts/rejudge-failed-posts.ts --limit 50  # cap the batch (default 200)
//
// budget_exceeded / no_key are configuration problems, not transient judge failures, so they
// are excluded. The recurring worker cron (worker/tasks/rejudge-failed-posts.ts) auto-heals the
// infra-transient subset on a bounded window; this script is the on-demand full sweep.

import { db } from "@/db/client";
import { rejudgeFailedPosts, REJUDGE_DEFAULT_LIMIT } from "@/pipeline/rejudge-failed-posts";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  const hours = Number(argValue("--hours") ?? 0);
  const limit = Number(argValue("--limit") ?? REJUDGE_DEFAULT_LIMIT);

  const tally = await rejudgeFailedPosts(db, {
    hours,
    limit,
    onPost: ({ id, reason, outcome, detail }) =>
      console.log(`  ${id} [was ${reason}] -> ${outcome}${detail}`),
  });

  console.log(`[rejudge] scanned ${tally.scanned} failed post(s)`);
  console.log(
    `[rejudge] done: newEvents=${tally.newEvent} merged=${tally.merged} stillFailed=${tally.stillFailed}`,
  );
  process.exit(tally.stillFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[rejudge] failed:", error);
  process.exit(1);
});
