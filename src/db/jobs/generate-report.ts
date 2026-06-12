// Report generation job (decision: reports are assembled deterministically from events,
// no LLM editorial step). Loads events for the window, runs the pure assembler, and
// upserts the calendar-keyed report row (decision E). The window is rolling and ends at
// `now` (spec: "last 24h" / "yesterday follow-up"); the row is keyed by the publish date
// in APP_TZ so /api/public/daily/{date} can address it. All kinds auto-publish (点11).

import { and, eq, gte, lt, or } from "drizzle-orm";
import { newId } from "@/core/ids";
import { APP_TZ, appCalendarDate, DAY_MS } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, reports, sources } from "@/db/schema";
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

function reportText(kind: ReportKind): ReportText {
  const r = messages.report;
  return {
    title: (ctx) => `${ctx.keywords.join(" / ")} · ${ctx.coverageLabel}`,
    sectionTitles: r.sections,
    summary: (ctx) => {
      if (ctx.itemCount === 0) return r.emptySummary;
      const topic = ctx.keywords.join("、");
      const counts = `${r.counts.focus} ${ctx.focus} · ${r.counts.watching} ${ctx.watching} · ${r.counts.followup} ${ctx.followup}`;
      if (ctx.kind === "weekly") return r.weeklySummary(topic, counts);
      if (ctx.kind === "monthly") return r.monthlySummary(topic, counts);
      return r.dailySummary(topic, counts);
    },
    readingPath: (ctx) => {
      if (ctx.topTitles.length === 0) return [];
      const primary = ctx.topTitles.slice(0, 3).join(" → ");
      if (ctx.kind === "weekly") return [r.weeklyReadingPath(primary), r.weeklyEditorNote(ctx.keywords.join("、"))];
      if (ctx.kind === "monthly") return [r.monthlyReadingPath(primary), r.monthlyEditorNote(ctx.keywords.join("、"))];
      return [r.dailyReadingPath(primary), r.dailyEditorNote(ctx.keywords.join("、"))];
    },
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
      tags: events.tags,
      url: posts.url,
      sourceName: sources.name,
      sourceHandle: sources.handle,
    })
    .from(events)
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
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
    tags: r.tags,
    sourceName: r.sourceName,
    sourceHandle: r.sourceHandle,
    publishedAt: r.publishedAt,
    promotedAt: r.promotedAt,
  }));

  const content = buildReport({
    kind,
    date,
    window,
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

/** Convenience for the 08:00 daily cron and the demo seed. */
export function generateDailyReport(now: Date = new Date(), db: DB = defaultDb): Promise<GenerateReportResult> {
  return generateReport("daily", now, db);
}
