// Report cron tasks (decision: 08:00 APP_TZ daily report; weekly/monthly drafted on a
// coarser schedule for review). Thin wrappers over the deterministic generateReport job.
// The worker process must run with TZ=APP_TZ so "08:00" means 08:00 in APP_TZ (decision E).

import type { Task } from "graphile-worker";
import { generateReport } from "@/db/jobs/generate-report";
import type { ReportKind } from "@/reports/types";

function makeTask(kind: ReportKind): Task {
  return async (_payload, helpers) => {
    const result = await generateReport(kind);
    helpers.logger.info(`[generate-report:${kind}] ${JSON.stringify(result)}`);
  };
}

export const generateDailyReportTask = makeTask("daily");
export const generateWeeklyReportTask = makeTask("weekly");
export const generateMonthlyReportTask = makeTask("monthly");
