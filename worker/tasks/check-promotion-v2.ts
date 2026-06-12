// check-promotion-v2 task (SP4): runs the deterministic B/A/S tournament on selection_score
// with the confidence cap. Thin wrapper over the db/jobs implementation. Supersedes
// check-promotion.

import type { Task } from "graphile-worker";
import { checkPromotionV2 } from "@/db/jobs/check-promotion-v2";

export const checkPromotionV2Task: Task = async (_payload, helpers) => {
  const result = await checkPromotionV2();
  helpers.logger.info(`[check-promotion-v2] ${JSON.stringify(result)}`);
};
