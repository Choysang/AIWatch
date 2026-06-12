// recompute-rank-scores task: re-applies the deterministic rank-score formula on
// likeCount / starCount and age. Thin wrapper over the db/jobs implementation.

import type { Task } from "graphile-worker";
import { recomputeRankScores } from "@/db/jobs/recompute-rank-scores";

export const recomputeRankScoresTask: Task = async (_payload, helpers) => {
  const result = await recomputeRankScores();
  helpers.logger.info(`[recompute-rank-scores] ${JSON.stringify(result)}`);
};
