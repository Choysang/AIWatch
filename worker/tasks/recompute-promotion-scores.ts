// recompute-promotion-scores task: re-derives promotion_score from expert signals
// and comment quality so the tournament always runs against fresh composite scores.
// Thin wrapper over the db/jobs implementation.

import type { Task } from "graphile-worker";
import { recomputePromotionScores } from "@/db/jobs/recompute-promotion-scores";

export const recomputePromotionScoresTask: Task = async (_payload, helpers) => {
  const result = await recomputePromotionScores();
  helpers.logger.info(`[recompute-promotion-scores] ${JSON.stringify(result)}`);
};
