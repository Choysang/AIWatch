// Source pause-suggestion decision (decision 9 / source strategy). Pure + deterministic:
// given a source's age and contribution metrics, decide whether to flag it for human review.
// The system only SUGGESTS — human confirmation is required before a source is paused
// (spec). The SQL job in db/jobs/suggest-source-review.ts computes the metrics and applies
// the decision; this module owns the policy so it can be golden-tested in isolation.

/** Why a source was flagged. `no_contribution_60d` is the stronger "suggest pause" signal. */
export type SourceReviewReason = "no_contribution_60d" | "low_selected_rate_30d";

export interface SourceReviewMetrics {
  createdAt: Date;
  /** null when the source has never crawled successfully. */
  lastFetchAt: Date | null;
  /** Events where this source is the main source and which were selected, in the last 60d. */
  selectedContribution60d: number;
  /** Events where this source is the main source in the last 30d. */
  events30d: number;
  /** Of events30d, how many were selected (B/A/S). */
  selectedCount30d: number;
}

export interface SourceReviewConfig {
  /** Min age before a no-contribution source is suggested for pause. */
  noContributionDays: number;
  /** Min age before the low-rate check applies. */
  lowRateDays: number;
  /** Min recent events before a rate is statistically worth judging. */
  minEventsForRate: number;
  /** Selected/total rate below this (over events30d) flags for review. */
  lowSelectedRate: number;
}

export const sourceReviewConfig: SourceReviewConfig = {
  noContributionDays: 60,
  lowRateDays: 30,
  minEventsForRate: 10,
  lowSelectedRate: 0.05,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function decideSourceReview(
  m: SourceReviewMetrics,
  now: Date = new Date(),
  config: SourceReviewConfig = sourceReviewConfig,
): SourceReviewReason | null {
  const ageMs = now.getTime() - m.createdAt.getTime();
  const hasCrawled = m.lastFetchAt != null;

  // Suggest pause: old enough, actually crawling, yet zero selected contribution in 60 days.
  // An un-crawled source is the breaker's/disable's job, not a contribution-quality flag.
  if (hasCrawled && ageMs >= config.noContributionDays * DAY_MS && m.selectedContribution60d === 0) {
    return "no_contribution_60d";
  }

  // Mark for review: enough recent events to judge, but the selected rate is very low.
  if (
    ageMs >= config.lowRateDays * DAY_MS &&
    m.events30d >= config.minEventsForRate &&
    m.selectedCount30d / m.events30d < config.lowSelectedRate
  ) {
    return "low_selected_rate_30d";
  }

  return null;
}
