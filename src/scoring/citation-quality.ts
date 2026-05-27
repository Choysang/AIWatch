// Deterministic citation_quality_score (Scoring Integrity slice).
//
// V1 does not track citations between events (the citation graph is a deferred feature —
// requires either a manual editor link or an LLM merge_detection follow-up to identify "X is
// a citation of Y"). Until that lands, this aggregator returns config.citationQualityNeutral
// (50) for every event so the promotion_score formula still composes — the term contributes
// a neutral 0.15*50 = 7.5 points, identical regardless of event.
//
// The shape (Inputs / Breakdown) is kept rich now so a later slice can swap in real data
// without changing every call site. A citation here means: another event/post explicitly
// references this event (by canonical URL match or LLM-asserted citation) within a fresh
// window. firstParty = the citing entity is in our L1/L2 source list (i.e., not just any
// blogger picking up the story).

import { scoringConfig, type ScoringConfig } from "./config";

export interface Citation {
  /** The citing entity is itself an L1/L2 (first-party / authoritative) source. */
  firstParty: boolean;
  /** Hours between the cited event's published_at and the citation's published_at. */
  ageHours: number;
}

export interface CitationQualityInputs {
  /**
   * Citations observed for this event. Pass `[]` (or omit) to signal "no citation tracking
   * for this run" — the aggregator returns the neutral baseline rather than zero so a fresh
   * event with no citations yet doesn't suppress its promotion_score.
   */
  citations?: readonly Citation[];
}

export interface CitationQualityBreakdown {
  configVersion: string;
  citationCount: number;
  firstPartyCount: number;
  weightedTotal: number;
  citationQualityScore: number;
  /** True when no citation data is available; score === citationQualityNeutral. */
  cold: boolean;
}

const FIRST_PARTY_WEIGHT = 3;
const OTHER_WEIGHT = 1;
const SATURATION = 6;
/** Citations older than this contribute zero (stale "echo" not signal). */
const FRESH_HOURS = 24 * 14;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function saturate(weight: number, saturation: number): number {
  if (weight <= 0 || saturation <= 0) return 0;
  return clamp01(Math.log1p(weight) / Math.log1p(saturation));
}

export function computeCitationQualityScore(
  inputs: CitationQualityInputs = {},
  config: ScoringConfig = scoringConfig,
): { citationQualityScore: number; breakdown: CitationQualityBreakdown } {
  const citations = inputs.citations ?? [];

  if (citations.length === 0) {
    return {
      citationQualityScore: config.citationQualityNeutral,
      breakdown: {
        configVersion: config.version,
        citationCount: 0,
        firstPartyCount: 0,
        weightedTotal: 0,
        citationQualityScore: config.citationQualityNeutral,
        cold: true,
      },
    };
  }

  let weightedTotal = 0;
  let firstPartyCount = 0;
  for (const c of citations) {
    if (c.ageHours > FRESH_HOURS) continue;
    const w = c.firstParty ? FIRST_PARTY_WEIGHT : OTHER_WEIGHT;
    weightedTotal += w;
    if (c.firstParty) firstPartyCount++;
  }

  const norm = saturate(weightedTotal, SATURATION);
  const citationQualityScore = Math.round(norm * 100);
  return {
    citationQualityScore,
    breakdown: {
      configVersion: config.version,
      citationCount: citations.length,
      firstPartyCount,
      weightedTotal,
      citationQualityScore,
      cold: false,
    },
  };
}
