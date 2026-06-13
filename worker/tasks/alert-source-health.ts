// alert-source-health task: hourly check that emails the operator when the X (Twitter)
// source pool is failing en masse (the TWITTER_AUTH_TOKEN-expired signature). Thin wrapper
// over the db/jobs implementation.

import type { Task } from "graphile-worker";
import { alertSourceHealth } from "@/db/jobs/alert-source-health";

export const alertSourceHealthTask: Task = async (_payload, helpers) => {
  const result = await alertSourceHealth();
  helpers.logger.info(`[alert-source-health] ${JSON.stringify(result)}`);
};
