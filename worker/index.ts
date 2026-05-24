// Bun worker entrypoint (decision 2): crawling, scoring, promotion, and the report
// cron live here, separate from the Next web process. graphile-worker owns its schema
// and runs its own migrations on start. Never imports src/app.

import { run } from "graphile-worker";
import { crawlSource } from "./tasks/crawl-source";
import { enqueueDueSources } from "./tasks/enqueue-due-sources";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

async function main(): Promise<void> {
  const runner = await run({
    connectionString,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    // Coarse cron: enqueue due sources once a minute. Per-source frequency is enforced
    // by getDueSources (next_fetch_at), not by many crontab lines.
    crontab: "* * * * * enqueue-due-sources",
    taskList: {
      "crawl-source": crawlSource,
      "enqueue-due-sources": enqueueDueSources,
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
