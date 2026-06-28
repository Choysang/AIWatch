// Report cron tasks. Daily publishes at 07:00 APP_TZ; weekly publishes Monday 06:00;
// monthly is triggered daily at 07:00 but only runs on the APP_TZ month-end date.
// The worker process must run with TZ=APP_TZ so crontab wallclock matches APP_TZ.

import type { Task } from "graphile-worker";
import { addCalendarDays, appCalendarDate, APP_TZ } from "@/core/time";
import { generateReport } from "@/db/jobs/generate-report";
import type { ReportKind } from "@/reports/types";

function isLastCalendarDayOfMonth(now: Date, tz = APP_TZ): boolean {
  const today = appCalendarDate(now, tz);
  const tomorrow = addCalendarDays(today, 1);
  return today.slice(0, 7) !== tomorrow.slice(0, 7);
}

function makeTask(kind: ReportKind, shouldRun: (now: Date) => boolean = () => true): Task {
  return async (_payload, helpers) => {
    const now = new Date();
    if (!shouldRun(now)) {
      helpers.logger.info(`[generate-report:${kind}] skipped; not scheduled calendar day`);
      return;
    }
    const result = await generateReport(kind, now);
    helpers.logger.info(`[generate-report:${kind}] ${JSON.stringify(result)}`);
  };
}

export const generateDailyReportTask = makeTask("daily");
export const generateWeeklyReportTask = makeTask("weekly");
export const generateMonthlyReportTask = makeTask("monthly", isLastCalendarDayOfMonth);