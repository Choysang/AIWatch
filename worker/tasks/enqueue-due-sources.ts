// enqueue-due-sources task: coarse cron scans the DB for due sources and enqueues one
// crawl-source job each (decision 5 — not 120 per-source crontab lines). A stable
// per-source jobKey keeps slow connectors from stacking duplicate retries.

import type { Task } from "graphile-worker";
import { getDueSources } from "@/db/queries/sources";

const ENQUEUE_LIMIT = 100;
export const CRAWL_SOURCE_MAX_ATTEMPTS = 3;

export function crawlSourceJobKey(sourceId: string): string {
  return `crawl-source:${sourceId}`;
}

export const enqueueDueSources: Task = async (_payload, helpers) => {
  const due = await getDueSources(ENQUEUE_LIMIT);
  for (const source of due) {
    await helpers.addJob(
      "crawl-source",
      { sourceId: source.id },
      {
        jobKey: crawlSourceJobKey(source.id),
        jobKeyMode: "preserve_run_at",
        maxAttempts: CRAWL_SOURCE_MAX_ATTEMPTS,
      },
    );
  }
  helpers.logger.info(`[enqueue-due-sources] enqueued ${due.length} source(s)`);
};
