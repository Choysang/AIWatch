// Default crawl interval per source tier (decision: source strategy fetch frequency).
// Higher tiers (first-party/people) are polled more often. Values are Postgres interval
// strings so they drop straight into sources.fetch_frequency. These are defaults applied
// at source creation; an admin can override per source in the DB.
//
// Spec ranges: L1 5-15m, L2 10-30m, L3 30-60m, L4 1-3h, L5 low/supplemental.

import type { SourceLevel } from "@/scoring/types";

const TIER_FETCH_FREQUENCY: Record<SourceLevel, string> = {
  L1: "10 minutes",
  L2: "20 minutes",
  L3: "45 minutes",
  L4: "2 hours",
  L5: "6 hours",
};

export function tierFetchFrequency(level: SourceLevel): string {
  return TIER_FETCH_FREQUENCY[level];
}
