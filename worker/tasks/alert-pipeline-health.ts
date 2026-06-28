// alert-pipeline-health task: hourly check that emails/logs when the LLM judge layer is
// failing and posts are stuck before event creation.

import type { Task } from "graphile-worker";
import { alertPipelineHealth } from "@/db/jobs/alert-pipeline-health";

export const alertPipelineHealthTask: Task = async (_payload, helpers) => {
  const result = await alertPipelineHealth();
  helpers.logger.info(`[alert-pipeline-health] ${JSON.stringify(result)}`);
};