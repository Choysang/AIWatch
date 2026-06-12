// Re-judge posts stuck in judge_failed. The crawl pipeline marks a post judge_failed when
// the LLM step errors (schema_invalid / provider_error / unknown) and never retries it —
// this script re-runs the same judge→fold/create path in place (no row deletion; success
// clears judge_error via markPostPipelineState).
//
//   bun run scripts/rejudge-failed-posts.ts             # retry schema_invalid + provider_error + unknown
//   bun run scripts/rejudge-failed-posts.ts --hours 12  # only failures from the last 12h
//   bun run scripts/rejudge-failed-posts.ts --limit 50  # cap the batch (default 200)
//
// budget_exceeded / no_key are configuration problems, not transient judge failures, so
// they are excluded — fix the config, then they can be retried by name if ever needed.

import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, sources } from "@/db/schema";
import { judgeAndStorePost, makeDefaultJudge } from "@/pipeline/process-source";
import type { RawPost } from "@/connectors/types";

const RETRYABLE_REASONS = ["schema_invalid", "provider_error", "unknown"];
const DEFAULT_LIMIT = 200;

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  const hours = Number(argValue("--hours") ?? 0);
  const limit = Number(argValue("--limit") ?? DEFAULT_LIMIT);

  const conditions = [
    isNotNull(posts.judgeFailedAt),
    inArray(posts.judgeError, RETRYABLE_REASONS),
  ];
  if (hours > 0) {
    conditions.push(gt(posts.judgeFailedAt, new Date(Date.now() - hours * 60 * 60 * 1000)));
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

  console.log(`[rejudge] ${failed.length} failed post(s) to retry`);
  const judge = makeDefaultJudge(db);
  const tally = { merged: 0, new_event: 0, failed: 0 };

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
    tally[outcome.kind === "failed" ? "failed" : outcome.kind]++;
    const detail = outcome.kind === "failed" ? ` (${outcome.reason})` : "";
    console.log(`  ${row.id} [was ${row.judgeError}] -> ${outcome.kind}${detail}`);
  }

  console.log(
    `[rejudge] done: newEvents=${tally.new_event} merged=${tally.merged} stillFailed=${tally.failed}`,
  );
  process.exit(tally.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[rejudge] failed:", error);
  process.exit(1);
});
