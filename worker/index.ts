// Bun worker entrypoint (decision 2): crawling, scoring, promotion, and the report
// cron live here, separate from the Next web process. graphile-worker owns its schema
// and runs its own migrations on start. Never imports src/app.

import { run } from "graphile-worker";
import { validateEnv } from "@/config/env";
import { checkPromotionV2Task } from "./tasks/check-promotion-v2";
import { crawlSource } from "./tasks/crawl-source";
import { enqueueDueSources } from "./tasks/enqueue-due-sources";
import {
  generateDailyReportTask,
  generateMonthlyReportTask,
  generateWeeklyReportTask,
} from "./tasks/generate-report";
import { alertSourceHealthTask } from "./tasks/alert-source-health";
import { digestPendingContributionsTask } from "./tasks/digest-pending-contributions";
import { recomputeScoresV2Task } from "./tasks/recompute-scores-v2";
import { recomputeRankScoresTask } from "./tasks/recompute-rank-scores";
import { refreshRoutingOverrides, refreshRoutingOverridesTask } from "./tasks/refresh-routing-overrides";
import { suggestSourceReviewTask } from "./tasks/suggest-source-review";

// Fail-fast on a misconfigured environment before opening the worker runtime (E1).
validateEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

async function main(): Promise<void> {
  // Prime the routing-override cache at boot (the cron keeps it fresh). Best-effort: a
  // failure (e.g. table not yet migrated) leaves the cache empty -> static/env routing.
  try {
    await refreshRoutingOverrides();
  } catch (error) {
    // eslint-disable-next-line no-console -- entrypoint lifecycle log
    console.warn("[worker] routing override prime failed (using static routing):", error);
  }

  const runner = await run({
    connectionString,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    // Coarse cron (worker runs with TZ=APP_TZ, decision E): enqueue due sources every
    // minute (per-source frequency is enforced by getDueSources, not crontab lines); run
    // the B/A/S tournament every 5 minutes; recompute the scoring-v2 layers (quality /
    // confidence / selection from expert + comment + multi-source signals) every 10 minutes
    // so the tournament always gates on a fresh selection_score; recompute rank scores every
    // 15 minutes so band transitions + accumulated
    // likes/stars gradually re-rank events without re-running the LLM; assemble reports
    // at 06:00 daily, Monday 09:00 weekly, and 1st 09:00 monthly; flag low-contribution
    // sources for human review daily at 08:30; digest newly submitted contributions
    // for owner/admin hourly at :20 (信源推荐收集); alert the operator hourly at :40 when
    // the X source pool fails en masse (TWITTER_AUTH_TOKEN-expired signature).
    crontab: [
      "* * * * * enqueue-due-sources",
      "*/10 * * * * recompute-scores-v2",
      "*/5 * * * * check-promotion-v2",
      "*/15 * * * * recompute-rank-scores",
      "0 6 * * * generate-daily-report",
      "0 9 * * 1 generate-weekly-report",
      "0 9 1 * * generate-monthly-report",
      "30 8 * * * suggest-source-review",
      "20 * * * * digest-pending-contributions",
      "40 * * * * alert-source-health",
      "* * * * * refresh-routing-overrides",
    ].join("\n"),
    taskList: {
      "crawl-source": crawlSource,
      "enqueue-due-sources": enqueueDueSources,
      "recompute-scores-v2": recomputeScoresV2Task,
      "check-promotion-v2": checkPromotionV2Task,
      "generate-daily-report": generateDailyReportTask,
      "generate-weekly-report": generateWeeklyReportTask,
      "generate-monthly-report": generateMonthlyReportTask,
      "suggest-source-review": suggestSourceReviewTask,
      "recompute-rank-scores": recomputeRankScoresTask,
      "digest-pending-contributions": digestPendingContributionsTask,
      "alert-source-health": alertSourceHealthTask,
      "refresh-routing-overrides": refreshRoutingOverridesTask,
    },
  });

  // eslint-disable-next-line no-console -- entrypoint lifecycle log
  console.log("[worker] started; crawling due sources every minute");
  await runner.promise;
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- fatal startup error
  console.error("[worker] fatal:", error);
  process.exit(1);
});
