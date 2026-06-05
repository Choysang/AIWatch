// Public API item shape (decision 13 / spec example). snake_case keys are the public
// contract consumed by agents; summaries are LLM-generated so the original url is
// authoritative. No internal score breakdown or provenance is exposed here.

import type { SelectedLevel } from "@/scoring/types";

export interface PublicItem {
  id: string;
  title: string;
  url: string | null;
  source_name: string | null;
  author_name: string | null;
  author_handle: string | null;
  summary: string | null;
  recommendation_reason: string | null;
  quality_score: number | null;
  view_count: number;
  selected_level: SelectedLevel;
  selected_label: string | null;
  category: string | null;
  content_type: string | null;
  tags: string[];
  published_at: string | null;
  promoted_at: string | null;
  media: unknown;
}

export interface PublicItemsResponse {
  items: PublicItem[];
  /** Opaque cursor for the next page, or null when there are no more results. */
  next_cursor: string | null;
}
