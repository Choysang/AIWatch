// Per-board narrative brief (v0.5 B2): the same deterministic report engine (buildReport),
// scoped to a topic board's interest (tags ∪ sources). Computed query-time — boards are owned
// by per-reader rid identities (millions), so a brief can't be precomputed/persisted like the
// global report. The interest filter is bounded and buildReport is pure, so on-demand assembly
// over a board-sized slice is cheap.

import { APP_TZ, appCalendarDate } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import { buildReport } from "@/reports/build-report";
import { reportConfig, type ReportConfig } from "@/reports/config";
import { loadReportEvents, reportWindow, type ReportInterest } from "@/reports/load-events";
import { reportText } from "@/reports/report-text";
import type { ReportContent, ReportKind } from "@/reports/types";

export interface BoardBriefParams {
  interest: ReportInterest;
  kind: ReportKind;
  now?: Date;
  tz?: string;
  config?: ReportConfig;
  db?: DB;
}

/** Assemble a board's brief for a kind (daily/weekly/monthly) from its interest. Pure given the
 *  loaded events; the only IO is the windowed interest query. An empty interest yields an empty
 *  brief (loadReportEvents short-circuits) rather than the whole feed. */
export async function buildBoardBrief(params: BoardBriefParams): Promise<ReportContent> {
  const { interest, kind, now = new Date(), tz = APP_TZ, config = reportConfig, db = defaultDb } = params;
  const date = appCalendarDate(now, tz);
  const win = reportWindow(kind, now);
  const events = await loadReportEvents(win, interest, db);
  return buildReport({
    kind,
    date,
    window: { start: win.start, end: win.end },
    events,
    text: reportText(kind),
    config,
  });
}
