// Report repair job: compensates for missed report cron runs and removes legacy rows
// that do not match the public schedule contract. Daily reports are due once the APP_TZ
// publish hour has passed; weekly/monthly rows are only valid on Monday / month-end.

import { and, eq, sql } from "drizzle-orm";
import { APP_TZ, addCalendarDays, appCalendarDate, dayBoundsUtc } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import { reports } from "@/db/schema";
import { generateReport } from "@/db/jobs/generate-report";

const DAILY_PUBLISH_HOUR = 7;
const DEFAULT_LOOKBACK_DAYS = 3;

export interface RepairReportsResult {
  generatedDaily: string[];
  skippedDaily: string[];
  deletedInvalidWeekly: number;
  deletedInvalidMonthly: number;
}

function reportPublishInstant(date: string, hour = DAILY_PUBLISH_HOUR, tz = APP_TZ): Date {
  const start = dayBoundsUtc(date, tz).start;
  return new Date(start.getTime() + hour * 60 * 60 * 1000);
}

async function hasPublishedDaily(date: string, db: DB): Promise<boolean> {
  const rows = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.kind, "daily"), eq(reports.status, "published"), eq(reports.reportDate, date)))
    .limit(1);
  return rows.length > 0;
}

async function deleteInvalidWeeklyReports(db: DB): Promise<number> {
  const result = await db
    .delete(reports)
    .where(
      and(
        eq(reports.kind, "weekly"),
        sql`extract(dow from ${reports.reportDate}::date) <> 1`,
      ),
    );
  return (result as unknown as { rowCount?: number | null }).rowCount ?? 0;
}

async function deleteInvalidMonthlyReports(db: DB): Promise<number> {
  const result = await db
    .delete(reports)
    .where(
      and(
        eq(reports.kind, "monthly"),
        sql`${reports.reportDate}::date <> (date_trunc('month', ${reports.reportDate}::date) + interval '1 month - 1 day')::date`,
      ),
    );
  return (result as unknown as { rowCount?: number | null }).rowCount ?? 0;
}

export async function repairReports(
  now = new Date(),
  db: DB = defaultDb,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
): Promise<RepairReportsResult> {
  const today = appCalendarDate(now, APP_TZ);
  const generatedDaily: string[] = [];
  const skippedDaily: string[] = [];

  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const date = addCalendarDays(today, -offset);
    const publishAt = reportPublishInstant(date);
    if (publishAt.getTime() > now.getTime()) {
      skippedDaily.push(date);
      continue;
    }
    if (await hasPublishedDaily(date, db)) {
      skippedDaily.push(date);
      continue;
    }
    await generateReport("daily", publishAt, db);
    generatedDaily.push(date);
  }

  const [deletedInvalidWeekly, deletedInvalidMonthly] = await Promise.all([
    deleteInvalidWeeklyReports(db),
    deleteInvalidMonthlyReports(db),
  ]);

  return { generatedDaily, skippedDaily, deletedInvalidWeekly, deletedInvalidMonthly };
}
