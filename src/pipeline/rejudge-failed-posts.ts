// Recover posts stuck in judge_failed by re-running the judge → fold/create path in place.
// Shared by the manual full-sweep script (scripts/rejudge-failed-posts.ts) and the recurring
// worker cron (worker/tasks/rejudge-failed-posts.ts). No row deletion; on success the normal
// pipeline state transition clears judge_error.
//
// budget_exceeded / no_key are configuration problems (not transient judge failures) and are
// never retried here — fix the config first. schema_invalid is a model-output issue: the
// auto-cron skips it (only infra-transient provider_error / unknown self-heal after a gateway
// outage), while the manual sweep includes it.

import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import type { RawPost } from "@/connectors/types";
import { db as defaultDb, type DB } from "@/db/client";
import { posts, sources } from "@/db/schema";
import { judgeAndStorePost, makeDefaultJudge } from "@/pipeline/process-source";

/** Judge failures retried by a full manual sweep. */
export const REJUDGE_RETRYABLE_REASONS = ["schema_invalid", "provider_error", "unknown"] as const;
/** Infra-transient failures the auto-cron self-heals (gateway unreachable / migration outage). */
export const REJUDGE_TRANSIENT_REASONS = ["provider_error", "unknown"] as const;
export const REJUDGE_DEFAULT_LIMIT = 200;

const HOUR_MS = 60 * 60 * 1000;

export interface RejudgePostResult {
  id: string;
  /** The judge_error the post was stuck on before this retry. */
  reason: string | null;
  outcome: "new_event" | "merged" | "failed";
  /** Extra detail (the new failure reason when the retry still fails). */
  detail: string;
}

export interface RejudgeOptions {
  /** Max posts to re-judge in one pass (default 200). */
  limit?: number;
  /** Only retry failures newer than this many hours (0 / undefined = no age bound). */
  hours?: number;
  /** judge_error reasons to retry (default: all retryable reasons). */
  reasons?: readonly string[];
  /** Per-post callback for progress logging (used by the manual script). */
  onPost?: (result: RejudgePostResult) => void;
}

export interface RejudgeTally {
  /** Posts matched + attempted this pass. */
  scanned: number;
  newEvent: number;
  merged: number;
  /** Still failed after the retry (judge erred again). */
  stillFailed: number;
}

/** Re-judge a bounded batch of judge_failed posts. Returns a tally; never throws per post. */
export async function rejudgeFailedPosts(
  db: DB = defaultDb,
  opts: RejudgeOptions = {},
): Promise<RejudgeTally> {
  const limit = opts.limit ?? REJUDGE_DEFAULT_LIMIT;
  const reasons = opts.reasons ?? REJUDGE_RETRYABLE_REASONS;
  const hours = opts.hours ?? 0;

  const conditions = [isNotNull(posts.judgeFailedAt), inArray(posts.judgeError, reasons as string[])];
  if (hours > 0) {
    conditions.push(gt(posts.judgeFailedAt, new Date(Date.now() - hours * HOUR_MS)));
  }

  const failed = await db
    .select({
      id: posts.id,
      sourceId: posts.sourceId,
      sourceLevel: sources.level,
      authorName: posts.authorName,
      authorHandle: posts.authorHandle,
      url: posts.url,
      canonicalUrl: posts.canonicalUrl,
      rawTitle: posts.rawTitle,
      rawContent: posts.rawContent,
      media: posts.media,
      publicMetrics: posts.publicMetrics,
      publishedAt: posts.publishedAt,
      judgeError: posts.judgeError,
    })
    .from(posts)
    .innerJoin(sources, eq(sources.id, posts.sourceId))
    .where(and(...conditions))
    .orderBy(asc(posts.judgeFailedAt))
    .limit(limit);

  const judge = makeDefaultJudge(db);
  const tally: RejudgeTally = { scanned: failed.length, newEvent: 0, merged: 0, stillFailed: 0 };

  for (const row of failed) {
    const raw: RawPost = {
      externalId: null,
      authorName: row.authorName,
      authorHandle: row.authorHandle,
      url: row.url,
      rawTitle: row.rawTitle,
      rawContent: row.rawContent,
      media: (row.media as RawPost["media"]) ?? null,
      publicMetrics: (row.publicMetrics as RawPost["publicMetrics"]) ?? null,
      publishedAt: row.publishedAt,
    };
    const outcome = await judgeAndStorePost(
      db,
      judge,
      { id: row.sourceId, level: row.sourceLevel },
      row.id,
      raw,
      row.canonicalUrl,
    );
    if (outcome.kind === "new_event") tally.newEvent++;
    else if (outcome.kind === "merged") tally.merged++;
    else tally.stillFailed++;
    opts.onPost?.({
      id: row.id,
      reason: row.judgeError,
      outcome: outcome.kind,
      detail: outcome.kind === "failed" ? ` (${outcome.reason})` : "",
    });
  }

  return tally;
}
