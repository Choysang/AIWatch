// Deterministic report assembler (pure). Given events already loaded for the window, it
// sorts them into the three spec sections. No LLM, no DB, no clock — same inputs always
// produce the same report, so this is golden-testable and a re-tune is just a re-run.

import { levelRank } from "@/scoring/promotion";
import { reportConfig, type ReportConfig } from "./config";
import type {
  ReportContent,
  ReportEvent,
  ReportItem,
  ReportKind,
  ReportSection,
  ReportText,
} from "./types";

export interface BuildReportParams {
  kind: ReportKind;
  /** Calendar key YYYY-MM-DD in APP_TZ. */
  date: string;
  /** UTC instant range [start, end) the report covers. */
  window: { start: Date; end: Date };
  events: ReportEvent[];
  text: ReportText;
  config?: ReportConfig;
}

function toItem(e: ReportEvent): ReportItem {
  return {
    id: e.id,
    title: e.title,
    conclusion: e.summary,
    why: e.recommendationReason,
    quality_score: e.qualityScore,
    selected_level: e.selectedLevel,
    selected_label: e.selectedLabel,
    category: e.category,
    url: e.url,
  };
}

/** Higher tier first (S>A>B), then most-recently promoted, then id for a stable order. */
function byTierThenPromoted(a: ReportEvent, b: ReportEvent): number {
  const tier = levelRank(b.selectedLevel) - levelRank(a.selectedLevel);
  if (tier !== 0) return tier;
  const at = a.promotedAt?.getTime() ?? 0;
  const bt = b.promotedAt?.getTime() ?? 0;
  if (bt !== at) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function inRange(t: Date | null, start: Date, end: Date): boolean {
  return t != null && t.getTime() >= start.getTime() && t.getTime() < end.getTime();
}

export function buildReport(params: BuildReportParams): ReportContent {
  const { kind, date, window, events, text, config = reportConfig } = params;

  // Today focus: events selected (B/A/S) within this window, strongest tier first.
  const focus = events
    .filter((e) => e.selectedLevel !== "none" && inRange(e.promotedAt, window.start, window.end))
    .sort(byTierThenPromoted)
    .slice(0, config.focusLimit);

  // Worth watching: high-quality, NOT-yet-selected events published this window.
  const watching = events
    .filter(
      (e) =>
        e.selectedLevel === "none" &&
        inRange(e.publishedAt, window.start, window.end) &&
        (e.qualityScore ?? 0) >= config.worthWatchingMinScore,
    )
    .sort((a, b) => {
      const q = (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
      if (q !== 0) return q;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, config.worthWatchingLimit);

  // Yesterday follow-up: events selected in the PRIOR equal-length window. (24h feedback
  // deltas are deferred until user/comment signals land; we surface the prior selections.)
  const len = window.end.getTime() - window.start.getTime();
  const priorStart = new Date(window.start.getTime() - len);
  const followup = events
    .filter((e) => e.selectedLevel !== "none" && inRange(e.promotedAt, priorStart, window.start))
    .sort(byTierThenPromoted)
    .slice(0, config.followupLimit);

  const sections: ReportSection[] = [
    { key: "today_focus", title: text.sectionTitles.today_focus, items: focus.map(toItem) },
    { key: "worth_watching", title: text.sectionTitles.worth_watching, items: watching.map(toItem) },
    {
      key: "yesterday_followup",
      title: text.sectionTitles.yesterday_followup,
      items: followup.map(toItem),
    },
  ];

  return {
    kind,
    date,
    title: text.title,
    summary: text.summary({
      focus: focus.length,
      watching: watching.length,
      followup: followup.length,
    }),
    sections,
  };
}
