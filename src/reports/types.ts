// Report domain types. Framework-agnostic; shared by the assembly job, the public API,
// and the reader UI. A report is assembled deterministically from events (decision: the
// LLM never makes editorial report decisions) and is calendar-keyed in APP_TZ (decision E).

import type { SelectedLevel } from "@/scoring/types";

export type ReportKind = "daily" | "weekly" | "monthly";
export type ReportStatus = "draft" | "published";

/** Fixed section keys (spec: daily report sections). */
export type SectionKey = "today_focus" | "worth_watching" | "yesterday_followup";

/** One event as it appears inside a report (spec: daily item shape). snake_case so the
 *  stored jsonb is also the public API contract. Community-feedback summary is deferred. */
export interface ReportItem {
  id: string;
  title: string;
  /** One-sentence "what happened" — event.summary. */
  conclusion: string | null;
  /** "Why it matters" — event.recommendation_reason. */
  why: string | null;
  quality_score: number | null;
  selected_level: SelectedLevel;
  selected_label: string | null;
  category: string | null;
  tags: string[];
  source_name: string | null;
  source_handle: string | null;
  url: string | null;
}

export interface ReportSection {
  key: SectionKey;
  title: string;
  items: ReportItem[];
}

/** The full assembled report payload, stored as jsonb and served by the public API. */
export interface ReportContent {
  kind: ReportKind;
  /** Calendar key YYYY-MM-DD in APP_TZ. */
  date: string;
  title: string;
  summary: string;
  /** Topic keywords used for the issue title and hero chips. Optional for legacy rows. */
  keywords?: string[];
  /** Human-readable publication window, e.g. "06.10 早报". Optional for legacy rows. */
  coverage_label?: string;
  /** Deterministic reading guidance assembled from the top items. Optional for legacy rows. */
  reading_path?: string[];
  sections: ReportSection[];
}

/** Event row consumed by the pure assembler (already loaded from the DB). */
export interface ReportEvent {
  id: string;
  title: string;
  summary: string | null;
  recommendationReason: string | null;
  category: string | null;
  qualityScore: number | null;
  selectedLevel: SelectedLevel;
  selectedLabel: string | null;
  url: string | null;
  tags: string[];
  sourceName: string | null;
  sourceHandle: string | null;
  publishedAt: Date | null;
  promotedAt: Date | null;
}

export interface SectionCounts {
  focus: number;
  watching: number;
  followup: number;
}

/** Localized strings injected into the pure assembler so it stays i18n-agnostic. */
export interface ReportTextContext extends SectionCounts {
  kind: ReportKind;
  date: string;
  keywords: string[];
  topTitles: string[];
  itemCount: number;
  coverageLabel: string;
}

export interface ReportText {
  title: (ctx: ReportTextContext) => string;
  sectionTitles: Record<SectionKey, string>;
  summary: (ctx: ReportTextContext) => string;
  readingPath: (ctx: ReportTextContext) => string[];
}
