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
  publishedAt: Date | null;
  promotedAt: Date | null;
}

export interface SectionCounts {
  focus: number;
  watching: number;
  followup: number;
}

/** Localized strings injected into the pure assembler so it stays i18n-agnostic. */
export interface ReportText {
  title: string;
  sectionTitles: Record<SectionKey, string>;
  summary: (counts: SectionCounts) => string;
}
