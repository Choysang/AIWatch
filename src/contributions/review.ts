// Contribution review state machine (decision 14: submitted -> triaged -> approved ->
// applied, with reject as an exit). Pure: validates transitions so the DB job and the
// admin route share one source of truth and can't move a contribution illegally.

import type { ContributionStatus } from "./types";

export type ReviewAction = "triage" | "approve" | "reject" | "apply";

const ACTION_RESULT: Record<ReviewAction, ContributionStatus> = {
  triage: "triaged",
  approve: "approved",
  reject: "rejected",
  apply: "applied",
};

const TRANSITIONS: Record<ContributionStatus, ReadonlySet<ContributionStatus>> = {
  submitted: new Set(["triaged", "approved", "rejected"]),
  triaged: new Set(["approved", "rejected"]),
  approved: new Set(["applied", "rejected"]),
  rejected: new Set(),
  applied: new Set(),
};

export function nextStatus(action: ReviewAction): ContributionStatus {
  return ACTION_RESULT[action];
}

export function canTransition(from: ContributionStatus, to: ContributionStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/** Returns the resulting status, or throws when the action is illegal from `from`. */
export function resolveTransition(from: ContributionStatus, action: ReviewAction): ContributionStatus {
  const to = nextStatus(action);
  if (!canTransition(from, to)) {
    throw new Error(`illegal contribution transition: ${from} -> ${to} (${action})`);
  }
  return to;
}
