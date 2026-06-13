// digest-pending-contributions task: hourly owner/admin digest of newly submitted
// contributions so the review queue never piles up unseen. Thin wrapper over db/jobs.

import type { Task } from "graphile-worker";
import { digestPendingContributions } from "@/db/jobs/digest-contributions";

export const digestPendingContributionsTask: Task = async (_payload, helpers) => {
  const result = await digestPendingContributions();
  helpers.logger.info(`[digest-pending-contributions] ${JSON.stringify(result)}`);
};
