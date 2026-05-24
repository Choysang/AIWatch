// Report generation job (decision: reports are assembled deterministically from events,
// no LLM editorial step). Loads events for the window, runs the pure assembler, and
// upserts the calendar-keyed report row (decision E). The window is rolling and ends at
// `now` (spec: "last 24h" / "yesterday follow-up"); the row is keyed by the publish date
// in APP_TZ so /api/public/daily/{date} can address it. Daily auto-publishes; weekly and
// monthly land as `draft` for review (spec).

import { and, eq, gte, lt, or } from "drizzle-orm";
import { newId } from "@/core/ids";
import { APP_TZ, appCalendarDate, DAY_MS } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, reports } from "@/db/schema";
import { messages } from "@/i18n";
import { buildReport } from "@/reports/build-report";
import { reportConfig, type ReportConfig } from "@/reports/config";
import type { ReportEvent, ReportKind, ReportStatus, ReportText, SectionCounts } from "@/reports/types";
import { scoringConfig } from "@/scoring/config";

const KIND_SPAN_DAYS: Record<ReportKind, number> = { daily: 1, weekly: 7, monthly: 30 };

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

function reportText(kind: ReportKind, date: string): ReportText {
  const r = messages.report;
  return {
    title: `${messages.appName} ${r.kind[kind]} · ${date}`,
    sectionTitles: r.sections,
    summary: (c) =>
      `${r.counts.focus} ${c.focus} · ${r.counts.watching} ${c.watching} · ${r.counts.followup} ${c.followup}`,
  };
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
  const spanMs = KIND_SPAN_DAYS[kind] * DAY_MS;
  const window = { start: new Date(now.getTime() - spanMs), end: now };
  // The follow-up section reaches one more equal-length window into the past.
  const priorStart = new Date(window.start.getTime() - spanMs);

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      summary: events.summary,
      recommendationReason: events.recommendationReason,
      category: events.category,
      qualityScore: events.qualityScore,
      selectedLevel: events.selectedLevel,
      selectedLabel: events.selectedLabel,
      publishedAt: events.publishedAt,
      promotedAt: events.promotedAt,
      url: posts.url,
    })
    .from(events)
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .where(
      or(
        and(gte(events.promotedAt, priorStart), lt(events.promotedAt, window.end)),
        and(gte(events.publishedAt, window.start), lt(events.publishedAt, window.end)),
      ),
    );

  const reportEvents: ReportEvent[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    recommendationReason: r.recommendationReason,
    category: r.category,
    qualityScore: r.qualityScore,
    selectedLevel: r.selectedLevel,
    selectedLabel: r.selectedLabel,
    url: r.url,
    publishedAt: r.publishedAt,
    promotedAt: r.promotedAt,
  }));

  const content = buildReport({
    kind,
    date,
    window,
    events: reportEvents,
    text: reportText(kind, date),
    config: cfg,
  });

  const status: ReportStatus = kind === "daily" ? "published" : "draft";
  const publishedAt = status === "published" ? now : null;
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

/** Convenience for the 08:00 daily cron and the demo seed. */
export function generateDailyReport(now: Date = new Date(), db: DB = defaultDb): Promise<GenerateReportResult> {
  return generateReport("daily", now, db);
}
