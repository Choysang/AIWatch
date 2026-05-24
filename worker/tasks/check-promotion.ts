// check-promotion task: runs the deterministic B/A/S tournament on a coarse cron.
// Slot windows are rolling, so periodic runs keep selections current as scores/age change.

import type { Task } from "graphile-worker";
import { checkPromotion } from "@/db/jobs/check-promotion";

export const checkPromotionTask: Task = async (_payload, helpers) => {
  const result = await checkPromotion();
  helpers.logger.info(`[check-promotion] ${JSON.stringify(result)}`);
};
