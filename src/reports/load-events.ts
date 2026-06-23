// Shared report event loader + window math. The global report job (db/jobs/generate-report)
// loads every event in the window; the per-board brief (reports/board-brief) passes an interest
// (tags ∪ sources) to scope the same window to a board. Both feed the pure assembler buildReport.

import { and, arrayOverlaps, eq, gte, inArray, lt, or, type SQL } from "drizzle-orm";
import { DAY_MS } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, sources } from "@/db/schema";
import type { ReportEvent, ReportKind } from "@/reports/types";

export const KIND_SPAN_DAYS: Record<ReportKind, number> = { daily: 1, weekly: 7, monthly: 30 };

export interface ReportWindow {
  /** Inclusive lower bound of the main window (published-at scope). */
  start: Date;
  /** Exclusive upper bound (= generation time). */
  end: Date;
  /** Start of the prior equal-length window the follow-up section reaches into. */
  priorStart: Date;
}

/** Rolling window ending at `now` for a report kind, plus the prior window for follow-up. */
export function reportWindow(kind: ReportKind, now: Date): ReportWindow {
  const spanMs = KIND_SPAN_DAYS[kind] * DAY_MS;
  const start = new Date(now.getTime() - spanMs);
  return { start, end: now, priorStart: new Date(start.getTime() - spanMs) };
}

/** A board "interest": match events with ANY of these tags OR from ANY of these sources. */
export interface ReportInterest {
  tags: string[];
  sourceIds: string[];
}

/** The interest OR predicate, or null when the interest is empty (matches nothing meaningful). */
function interestPredicate(interest: ReportInterest): SQL | null {
  const parts: SQL[] = [];
  if (interest.tags.length) parts.push(arrayOverlaps(events.tags, interest.tags));
  if (interest.sourceIds.length) parts.push(inArray(events.mainSourceId, interest.sourceIds));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return or(...parts) ?? null;
}

/**
 * Load the events a report covers: promoted in [priorStart, end) OR published in [start, end).
 * When `interest` is given, the window is further narrowed to events matching the interest
 * (tags ∪ sources). Returns the ReportEvent projection the pure assembler consumes.
 */
export async function loadReportEvents(
  win: ReportWindow,
  interest: ReportInterest | undefined,
  db: DB = defaultDb,
): Promise<ReportEvent[]> {
  const windowCond = or(
    and(gte(events.promotedAt, win.priorStart), lt(events.promotedAt, win.end)),
    and(gte(events.publishedAt, win.start), lt(events.publishedAt, win.end)),
  );
  const conds: SQL[] = [];
  if (windowCond) conds.push(windowCond);
  if (interest) {
    const pred = interestPredicate(interest);
    // An empty interest matches nothing — short-circuit to an empty brief rather than the
    // whole window (which would silently look like "all events").
    if (!pred) return [];
    conds.push(pred);
  }

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
    .where(conds.length ? and(...conds) : undefined);

  return rows.map((r) => ({
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
}
