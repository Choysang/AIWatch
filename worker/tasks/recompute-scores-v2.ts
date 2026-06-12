// recompute-scores-v2 task (SP4): re-derives the layered scoring-v2 model (quality /
// confidence / selection) from immutable judgment dimensions + source level + merged-post
// count + reader/expert signals, denormalizing selection_score onto events for the tournament.
// Thin wrapper over the db/jobs implementation. Supersedes recompute-promotion-scores.

import type { Task } from "graphile-worker";
import { recomputeScoresV2 } from "@/db/jobs/recompute-scores-v2";

export const recomputeScoresV2Task: Task = async (_payload, helpers) => {
  const result = await recomputeScoresV2();
  helpers.logger.info(`[recompute-scores-v2] ${JSON.stringify(result)}`);
};
