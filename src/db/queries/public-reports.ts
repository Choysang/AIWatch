// Report read queries. Public endpoints serve only PUBLISHED reports, filtered by kind.
// 点11 (2026-06-12): weekly/monthly auto-publish like daily (the draft-review flow never
// landed), so the kind-generic queries back /reports, /reports/weekly and /reports/monthly.
// A separate admin listing surfaces every kind/status for the console.

import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { reports } from "@/db/schema";
import type { ReportContent, ReportKind, ReportStatus } from "@/reports/types";

/** Full report payload for /daily and /daily/{date}: stored content + generation time. */
export interface PublicReport extends ReportContent {
  generated_at: string;
}

/** Lightweight row for /dailies and the reader archive (no sections). */
export interface PublicReportListItem {
  date: string;
  title: string;
  summary: string | null;
  generated_at: string;
}

const MAX_DAILIES = 60;

function toPublic(row: { content: unknown; generatedAt: Date }): PublicReport {
  return { ...(row.content as ReportContent), generated_at: row.generatedAt.toISOString() };
}

/** Latest published report of a kind, or null when none exists yet (点11: 周/月报公开). */
export async function getLatestByKind(
  kind: ReportKind,
  db: DB = defaultDb,
): Promise<PublicReport | null> {
  const rows = await db
    .select({ content: reports.content, generatedAt: reports.generatedAt })
    .from(reports)
    .where(and(eq(reports.kind, kind), eq(reports.status, "published")))
    .orderBy(desc(reports.reportDate))
    .limit(1);
  return rows[0] ? toPublic(rows[0]) : null;
}

/** Published report of a kind for an exact calendar date (YYYY-MM-DD in APP_TZ), or null. */
export async function getByKindAndDate(
  kind: ReportKind,
  date: string,
  db: DB = defaultDb,
): Promise<PublicReport | null> {
  const rows = await db
    .select({ content: reports.content, generatedAt: reports.generatedAt })
    .from(reports)
    .where(
      and(eq(reports.kind, kind), eq(reports.status, "published"), eq(reports.reportDate, date)),
    )
    .limit(1);
  return rows[0] ? toPublic(rows[0]) : null;
}

/** Recent published reports of a kind, newest first (capped). For archives + /dailies. */
export async function listByKind(
  kind: ReportKind,
  take = 14,
  db: DB = defaultDb,
): Promise<PublicReportListItem[]> {
  const capped = Math.min(Math.max(1, Math.floor(take)), MAX_DAILIES);
  const rows = await db
    .select({
      reportDate: reports.reportDate,
      title: reports.title,
      summary: reports.summary,
      generatedAt: reports.generatedAt,
    })
    .from(reports)
    .where(and(eq(reports.kind, kind), eq(reports.status, "published")))
    .orderBy(desc(reports.reportDate))
    .limit(capped);
  return rows.map((r) => ({
    date: r.reportDate,
    title: r.title,
    summary: r.summary,
    generated_at: r.generatedAt.toISOString(),
  }));
}

/** Latest published daily report, or null when none exists yet. */
export function getLatestDaily(db: DB = defaultDb): Promise<PublicReport | null> {
  return getLatestByKind("daily", db);
}

/** Published daily report for an exact calendar date (YYYY-MM-DD in APP_TZ), or null. */
export function getDailyByDate(date: string, db: DB = defaultDb): Promise<PublicReport | null> {
  return getByKindAndDate("daily", date, db);
}

/** Recent published daily reports, newest first (capped). For /dailies + reader archive. */
export function listDailies(take = 14, db: DB = defaultDb): Promise<PublicReportListItem[]> {
  return listByKind("daily", take, db);
}

/** Admin console row: every kind/status, newest first. */
export interface AdminReportRow {
  kind: ReportKind;
  date: string;
  status: ReportStatus;
  summary: string | null;
  generatedAt: Date;
}

export async function listRecentReports(take = 20, db: DB = defaultDb): Promise<AdminReportRow[]> {
  const rows = await db
    .select({
      kind: reports.kind,
      reportDate: reports.reportDate,
      status: reports.status,
      summary: reports.summary,
      generatedAt: reports.generatedAt,
    })
    .from(reports)
    .orderBy(desc(reports.generatedAt))
    .limit(Math.min(Math.max(1, Math.floor(take)), 100));
  return rows.map((r) => ({
    kind: r.kind,
    date: r.reportDate,
    status: r.status,
    summary: r.summary,
    generatedAt: r.generatedAt,
  }));
}
