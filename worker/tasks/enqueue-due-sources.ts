// enqueue-due-sources task: coarse cron scans the DB for due sources and enqueues one
// crawl-source job each (decision 5 — not 120 per-source crontab lines). A 1-minute
// time bucket in the jobKey dedups overlapping cron ticks for the same source.

import type { Task } from "graphile-worker";
import { getDueSources } from "@/db/queries/sources";

const ENQUEUE_LIMIT = 100;

export const enqueueDueSources: Task = async (_payload, helpers) => {
  const due = await getDueSources(ENQUEUE_LIMIT);
  const bucket = Math.floor(Date.now() / 60_000);
  for (const source of due) {
    await helpers.addJob(
      "crawl-source",
      { sourceId: source.id },
      { jobKey: `crawl-source:${source.id}:${bucket}`, jobKeyMode: "preserve_run_at" },
    );
  }
  helpers.logger.info(`[enqueue-due-sources] enqueued ${due.length} source(s)`);
};
