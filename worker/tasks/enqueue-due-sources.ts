// enqueue-due-sources task: coarse cron scans the DB for due sources and enqueues one
// crawl-source job each (decision 5 — not 120 per-source crontab lines). A stable
// per-source jobKey keeps slow connectors from stacking duplicate retries.

import type { Task } from "graphile-worker";
import { getDueSources, type DueSource } from "@/db/queries/sources";

export const DEFAULT_ENQUEUE_LIMIT = 20;
export const DEFAULT_RSSHUB_X_ENQUEUE_LIMIT = 2;
export const DEFAULT_RSSHUB_X_STAGGER_MS = 30_000;

const ENQUEUE_LIMIT = positiveInt(process.env.SOURCE_ENQUEUE_LIMIT, DEFAULT_ENQUEUE_LIMIT);
const DUE_SCAN_LIMIT = Math.max(ENQUEUE_LIMIT, Math.min(200, ENQUEUE_LIMIT * 5));
const RSSHUB_X_ENQUEUE_LIMIT = positiveInt(
  process.env.RSSHUB_X_ENQUEUE_LIMIT,
  DEFAULT_RSSHUB_X_ENQUEUE_LIMIT,
);
const RSSHUB_X_STAGGER_MS = positiveInt(
  process.env.RSSHUB_X_STAGGER_MS,
  DEFAULT_RSSHUB_X_STAGGER_MS,
);
export const CRAWL_SOURCE_MAX_ATTEMPTS = 3;

export function crawlSourceJobKey(sourceId: string): string {
  return `crawl-source:${sourceId}`;
}

type EnqueueSource = Pick<DueSource, "id" | "platform" | "connectorType">;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function isRsshubXSource(source: EnqueueSource): boolean {
  return source.platform === "x" && source.connectorType === "rsshub";
}

export function selectDueSourcesForEnqueue<T extends EnqueueSource>(
  due: readonly T[],
  opts: { limit?: number; rsshubXLimit?: number } = {},
): T[] {
  const limit = opts.limit ?? ENQUEUE_LIMIT;
  const rsshubXLimit = opts.rsshubXLimit ?? RSSHUB_X_ENQUEUE_LIMIT;
  const selected: T[] = [];
  let rsshubXCount = 0;

  for (const source of due) {
    if (isRsshubXSource(source)) {
      if (rsshubXCount >= rsshubXLimit) continue;
      rsshubXCount++;
    }
    selected.push(source);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function crawlSourceRunAt(
  source: EnqueueSource,
  rsshubXIndex: number,
  now = Date.now(),
): Date | undefined {
  if (!isRsshubXSource(source)) return undefined;
  return new Date(now + rsshubXIndex * RSSHUB_X_STAGGER_MS);
}

export const enqueueDueSources: Task = async (_payload, helpers) => {
  const due = selectDueSourcesForEnqueue(await getDueSources(DUE_SCAN_LIMIT), {
    limit: ENQUEUE_LIMIT,
    rsshubXLimit: RSSHUB_X_ENQUEUE_LIMIT,
  });
  let rsshubXIndex = 0;
  const now = Date.now();
  for (const source of due) {
    const xIndex = isRsshubXSource(source) ? rsshubXIndex++ : 0;
    await helpers.addJob(
      "crawl-source",
      { sourceId: source.id },
      {
        jobKey: crawlSourceJobKey(source.id),
        jobKeyMode: "preserve_run_at",
        maxAttempts: CRAWL_SOURCE_MAX_ATTEMPTS,
        runAt: crawlSourceRunAt(source, xIndex, now),
      },
    );
  }
  helpers.logger.info(`[enqueue-due-sources] enqueued ${due.length} source(s)`);
};
