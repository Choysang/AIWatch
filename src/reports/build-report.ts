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
  ReportTextContext,
  ReportText,
} from "./types";

const FALLBACK_KEYWORD = "AI";
const MAX_KEYWORDS = 3;

const KEYWORD_STOP_WORDS = new Set([
  "AI",
  "人工智能",
  "发布",
  "宣布",
  "更新",
  "上线",
  "模型",
  "产品",
  "技术",
  "行业",
  "研究",
  "教程",
  "观点",
  "讨论",
  "最新",
  "如何",
  "为什么",
  "什么",
  "一个",
  "一种",
  "这个",
  "这些",
]);

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
    tags: e.tags,
    source_name: e.sourceName,
    source_handle: e.sourceHandle,
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

function normalizeKeyword(raw: string): string | null {
  const cleaned = raw
    .replace(/^#+/, "")
    .replace(/[「」"'“”]/g, "")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  if (KEYWORD_STOP_WORDS.has(cleaned)) return null;
  return cleaned;
}

function titleTerms(title: string): string[] {
  const parts = title
    .split(/[：:｜|/、，,。；;·\-—()[\]【】]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const terms: string[] = [];
  for (const part of parts) {
    const latin = part.match(/[A-Za-z][A-Za-z0-9.+-]*(?:\s+[A-Za-z0-9.+-]+){0,2}/g);
    if (latin) terms.push(...latin);
    if (/[\u4e00-\u9fff]/.test(part) && part.length <= 12) terms.push(part);
  }
  return terms;
}

function addKeyword(
  scores: Map<string, { score: number; firstSeen: number }>,
  raw: string | null | undefined,
  score: number,
  firstSeen: number,
): void {
  if (!raw) return;
  const keyword = normalizeKeyword(raw);
  if (!keyword) return;
  const current = scores.get(keyword);
  if (!current) {
    scores.set(keyword, { score, firstSeen });
    return;
  }
  current.score += score;
}

function collectKeywords(events: ReportEvent[]): string[] {
  const scores = new Map<string, { score: number; firstSeen: number }>();
  events.forEach((event, index) => {
    const baseOrder = index * 100;
    event.tags.forEach((tag, tagIndex) => addKeyword(scores, tag, 4, baseOrder + tagIndex));
    addKeyword(scores, event.category, 2, baseOrder + 50);
    titleTerms(event.title).forEach((term, termIndex) => addKeyword(scores, term, 1, baseOrder + 70 + termIndex));
  });

  const keywords = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].firstSeen - b[1].firstSeen || a[0].localeCompare(b[0]))
    .map(([keyword]) => keyword)
    .slice(0, MAX_KEYWORDS);
  return keywords.length ? keywords : [FALLBACK_KEYWORD];
}

function monthDay(date: string): string {
  const [, month, day] = date.split("-");
  return month && day ? `${month}.${day}` : date;
}

function coverageLabel(kind: ReportKind, date: string): string {
  const d = monthDay(date);
  if (kind === "daily") return `${d} 早报`;
  if (kind === "weekly") return `${d} 周刊`;
  return `${d} 月报`;
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
  const orderedItems = [...focus, ...watching, ...followup];
  const keywords = collectKeywords(orderedItems.length ? orderedItems : events);
  const ctx: ReportTextContext = {
    kind,
    date,
    keywords,
    topTitles: orderedItems.slice(0, 3).map((e) => e.title),
    itemCount: orderedItems.length,
    coverageLabel: coverageLabel(kind, date),
    focus: focus.length,
    watching: watching.length,
    followup: followup.length,
  };

  return {
    kind,
    date,
    title: text.title(ctx),
    summary: text.summary(ctx),
    keywords,
    coverage_label: ctx.coverageLabel,
    reading_path: text.readingPath(ctx),
    sections,
  };
}
