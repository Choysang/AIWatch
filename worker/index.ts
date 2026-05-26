// Bun worker entrypoint (decision 2): crawling, scoring, promotion, and the report
// cron live here, separate from the Next web process. graphile-worker owns its schema
// and runs its own migrations on start. Never imports src/app.

import { run } from "graphile-worker";
import { checkPromotionTask } from "./tasks/check-promotion";
import { crawlSource } from "./tasks/crawl-source";
import { enqueueDueSources } from "./tasks/enqueue-due-sources";
import {
  generateDailyReportTask,
  generateMonthlyReportTask,
  generateWeeklyReportTask,
} from "./tasks/generate-report";
import { recomputeRankScoresTask } from "./tasks/recompute-rank-scores";
import { suggestSourceReviewTask } from "./tasks/suggest-source-review";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

async function main(): Promise<void> {
  const runner = await run({
    connectionString,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    // Coarse cron (worker runs with TZ=APP_TZ, decision E): enqueue due sources every
    // minute (per-source frequency is enforced by getDueSources, not crontab lines); run
    // the B/A/S tournament every 5 minutes; assemble the daily report at 08:00, the weekly
    // draft Monday 08:00, and the monthly draft on the 1st at 08:00; flag low-contribution
    // sources for human review daily at 08:30 (after the day's report is in); recompute
    // rank scores every 15 minutes so band transitions + accumulated likes/stars
    // gradually re-rank events without re-running the LLM.
    crontab: [
      "* * * * * enqueue-due-sources",
      "*/5 * * * * check-promotion",
      "*/15 * * * * recompute-rank-scores",
      "0 8 * * * generate-daily-report",
      "0 8 * * 1 generate-weekly-report",
      "0 8 1 * * generate-monthly-report",
      "30 8 * * * suggest-source-review",
    ].join("\n"),
    taskList: {
      "crawl-source": crawlSource,
      "enqueue-due-sources": enqueueDueSources,
      "check-promotion": checkPromotionTask,
      "generate-daily-report": generateDailyReportTask,
      "generate-weekly-report": generateWeeklyReportTask,
      "generate-monthly-report": generateMonthlyReportTask,
      "suggest-source-review": suggestSourceReviewTask,
      "recompute-rank-scores": recomputeRankScoresTask,
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
