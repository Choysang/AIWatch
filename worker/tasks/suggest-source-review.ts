// suggest-source-review task: daily scan that flags low-contribution sources for human
// review (never auto-pauses). Thin wrapper over the db/jobs implementation.

import type { Task } from "graphile-worker";
import { suggestSourceReviews } from "@/db/jobs/suggest-source-review";

export const suggestSourceReviewTask: Task = async (_payload, helpers) => {
  const result = await suggestSourceReviews();
  helpers.logger.info(`[suggest-source-review] ${JSON.stringify(result)}`);
};
