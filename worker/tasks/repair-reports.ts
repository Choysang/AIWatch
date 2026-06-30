// Hourly report repair task. It is intentionally idempotent: if the scheduled daily
// report already exists, it only cleans invalid historical weekly/monthly rows.

import type { Task } from "graphile-worker";
import { repairReports } from "@/db/jobs/repair-reports";

export const repairReportsTask: Task = async (_payload, helpers) => {
  const result = await repairReports();
  helpers.logger.info(`[repair-reports] ${JSON.stringify(result)}`);
};
