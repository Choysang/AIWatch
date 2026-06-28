// Report generation job (decision: reports are assembled deterministically from events,
// no LLM editorial step). Loads events for the window, runs the pure assembler, and
// upserts the calendar-keyed report row (decision E). The window is rolling and ends at
// `now` (spec: "last 24h" / "yesterday follow-up"); the row is keyed by the publish date
// in APP_TZ so /api/public/daily/{date} can address it. All kinds auto-publish (点11).

import { newId } from "@/core/ids";
import { APP_TZ, appCalendarDate } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import { reports } from "@/db/schema";
import { buildReport } from "@/reports/build-report";
import { reportConfig, type ReportConfig } from "@/reports/config";
import { loadReportEvents, reportWindow } from "@/reports/load-events";
import { reportText } from "@/reports/report-text";
import type { ReportKind, ReportStatus, SectionCounts } from "@/reports/types";
import { scoringConfig } from "@/scoring/config";

export interface GenerateReportResult {
  id: string;
  kind: ReportKind;
  date: string;
  status: ReportStatus;
  counts: SectionCounts;
}

export interface GenerateReportOptions {
  tz?: string;
  reportCfg?: ReportConfig;
}

export async function generateReport(
  kind: ReportKind,
  now: Date = new Date(),
  db: DB = defaultDb,
  opts: GenerateReportOptions = {},
): Promise<GenerateReportResult> {
  const tz = opts.tz ?? APP_TZ;
  const cfg = opts.reportCfg ?? reportConfig;

  // Rolling window ending at generation time; keyed by the publish calendar date in tz.
  const date = appCalendarDate(now, tz);
  const win = reportWindow(kind, now);
  const reportEvents = await loadReportEvents(win, undefined, db);

  const content = buildReport({
    kind,
    date,
    window: { start: win.start, end: win.end },
    events: reportEvents,
    text: reportText(kind),
    config: cfg,
  });

  // 点11（2026-06-12）：周报/月报原设计是 draft 等人工复核，但复核流从未落地，读者侧
  // 模块因此常年空白。报告是确定性拼装（无 LLM 编辑步），三种粒度统一自动发布。
  const status: ReportStatus = "published";
  const publishedAt = now;
  const counts: SectionCounts = {
    focus: content.sections[0]!.items.length,
    watching: content.sections[1]!.items.length,
    followup: content.sections[2]!.items.length,
  };

  const inserted = await db
    .insert(reports)
    .values({
      id: newId("rpt"),
      kind,
      reportDate: date,
      appTz: tz,
      status,
      title: content.title,
      summary: content.summary,
      content,
      reportConfigVersion: cfg.version,
      scoringConfigVersion: scoringConfig.version,
      generatedAt: now,
      publishedAt,
    })
    .onConflictDoUpdate({
      target: [reports.kind, reports.reportDate],
      // Regeneration overwrites content but keeps the existing row id (stable address).
      set: {
        status,
        title: content.title,
        summary: content.summary,
        content,
        reportConfigVersion: cfg.version,
        scoringConfigVersion: scoringConfig.version,
        generatedAt: now,
        publishedAt,
      },
    })
    .returning({ id: reports.id });

  return { id: inserted[0]!.id, kind, date, status, counts };
}

/** Convenience for the 07:00 daily cron and the demo seed. */
export function generateDailyReport(now: Date = new Date(), db: DB = defaultDb): Promise<GenerateReportResult> {
  return generateReport("daily", now, db);
}
