// RBAC capability map (decision 10/14: capability map lives in code). Roles map to
// capabilities here, so route handlers ask `can(role, capability)` instead of hard-coding
// role lists. Framework-agnostic (no next/react) to respect the import boundary.

export type Role =
  | "user"
  | "expert"
  | "moderator"
  | "selected_author"
  | "admin"
  | "owner"
  | "readonly_operator";

export type Capability =
  | "contribution.triage"
  | "contribution.approve" // approve or reject a non-sensitive contribution
  | "contribution.apply" // apply an approved non-sensitive contribution to the DB
  | "contribution.applySensitive" // source level, expert weight, scoring config
  | "source.moderate" // approve / pause / remove / edit a source
  | "event.directPush" // certified expert direct-push an event to B tier (Scoring Integrity)
  | "audit.view";

// Decision 14: public submit (no capability), moderators triage, selected-authors/admins
// approve, only admin/owner apply sensitive changes. readonly_operator inspects only.
// event.directPush: certified experts AND moderators/admins/owners may force B-tier on an
// event (spec § B — "score >= 75, or certified expert direct-push"). selected_author also
// gets the lever so curation can rescue under-scored picks without admin escalation.
const CAPABILITIES: Record<Capability, ReadonlySet<Role>> = {
  "contribution.triage": new Set(["moderator", "selected_author", "admin", "owner"]),
  "contribution.approve": new Set(["selected_author", "admin", "owner"]),
  "contribution.apply": new Set(["selected_author", "admin", "owner"]),
  "contribution.applySensitive": new Set(["admin", "owner"]),
  "source.moderate": new Set(["selected_author", "admin", "owner"]),
  "event.directPush": new Set(["expert", "moderator", "selected_author", "admin", "owner"]),
  "audit.view": new Set(["moderator", "selected_author", "admin", "owner", "readonly_operator"]),
};

export function can(role: Role | string | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[capability].has(role as Role);
}
