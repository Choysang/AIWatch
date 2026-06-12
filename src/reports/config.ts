// Report assembly tuning, config-as-code + version-stamped (same discipline as scoring
// config). Changing a number is a reviewable PR + a version bump + a regenerate, never an
// ad-hoc edit in business code. Defaults are proposed; calibrate with real volume.

export interface ReportConfig {
  version: string;
  /** Min quality_score for a non-selected event to appear in "worth watching". */
  worthWatchingMinScore: number;
  /** Max items per section. */
  focusLimit: number;
  worthWatchingLimit: number;
  followupLimit: number;
}

export const reportConfig: ReportConfig = {
  version: "report-v1",
  worthWatchingMinScore: 70,
  focusLimit: 30,
  worthWatchingLimit: 5,
  followupLimit: 10,
};
