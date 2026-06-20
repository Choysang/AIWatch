// rejudge-failed-posts task: auto-recover posts whose judge step failed for infra-transient
// reasons (the LLM gateway was unreachable during an outage / migration). Runs hourly so gaps
// self-heal without a manual sweep — "每次更新自动检索缺漏并补回".
//
// Cost-bounded so a recurring sweep can't run away: only the last CRON_WINDOW_HOURS of failures,
// CRON_BATCH_LIMIT per run, and only provider_error / unknown (schema_invalid stays a manual
// decision via the script). The judge path is itself spend-guarded, so a budget_exceeded post
// drops out of the retry set (its judge_error is no longer in the transient set) on its own.

import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { rejudgeFailedPosts, REJUDGE_TRANSIENT_REASONS } from "@/pipeline/rejudge-failed-posts";

const CRON_WINDOW_HOURS = 48;
const CRON_BATCH_LIMIT = 50;

export const rejudgeFailedPostsTask: Task = async (_payload, helpers) => {
  const tally = await rejudgeFailedPosts(db, {
    hours: CRON_WINDOW_HOURS,
    limit: CRON_BATCH_LIMIT,
    reasons: REJUDGE_TRANSIENT_REASONS,
  });
  if (tally.scanned > 0) {
    helpers.logger.info(
      `[rejudge-failed-posts] scanned=${tally.scanned} new=${tally.newEvent} merged=${tally.merged} stillFailed=${tally.stillFailed}`,
    );
  }
};
