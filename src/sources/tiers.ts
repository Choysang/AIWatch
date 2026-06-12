// Default crawl interval per source tier (decision: source strategy fetch frequency).
// Higher tiers (first-party/people) are polled more often. Values are Postgres interval
// strings so they drop straight into sources.fetch_frequency. These are defaults applied
// at source creation; an admin can override per source in the DB.
//
// Production cap: every monitored source must poll at least once every 10 minutes.

import type { SourceLevel } from "@/scoring/types";

const TIER_FETCH_FREQUENCY: Record<SourceLevel, string> = {
  L1: "5 minutes",
  L2: "10 minutes",
  L3: "10 minutes",
  L4: "10 minutes",
  L5: "10 minutes",
};

export function tierFetchFrequency(level: SourceLevel): string {
  return TIER_FETCH_FREQUENCY[level];
}
