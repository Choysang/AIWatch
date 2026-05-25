// Contribution domain types (decision 14). Mirrors the DB enums; kept as string-literal
// unions so framework-agnostic code can use them without importing the Drizzle schema.

export type ContributionKind =
  | "source_recommendation"
  | "source_metadata_fix"
  | "tag_category_suggestion"
  | "merge_association_suggestion"
  | "correction_report"
  | "documentation";

export type ContributionTarget = "source" | "event" | "post" | "report" | "config" | "documentation";

export type ContributionStatus = "submitted" | "triaged" | "approved" | "rejected" | "applied";

/** The canonical target object type for each contribution kind. */
export const KIND_TARGET: Record<ContributionKind, ContributionTarget> = {
  source_recommendation: "source",
  source_metadata_fix: "source",
  tag_category_suggestion: "event",
  merge_association_suggestion: "event",
  correction_report: "event",
  documentation: "documentation",
};
