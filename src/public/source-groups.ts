// Reader-facing source-type grouping (SP2 point 4). The DB keeps seven `source_type`
// enum values (see sourceTypeEnum / SOURCE_TYPES), but readers think in four buckets:
//   官方   official            ← official
//   专家   expert              ← employee + expert + kol (insiders + domain experts + KOLs)
//   媒体   media               ← media
//   社区   community           ← community + open_source_project
// This is a pure read-side mapping: the filter UI shows four group chips, and toggling a
// group expands to its member source_types written into the existing `sourceTypes` URL
// param — so the query layer is unchanged and there is NO migration. Cards label their
// source by the same mapping. This module is the single source of truth for the grouping.

import { SOURCE_TYPES, type SourceType } from "./query";

export const SOURCE_GROUPS = ["official", "expert", "media", "community"] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

/** Members of each group. Must partition SOURCE_TYPES exactly (asserted in tests). */
export const GROUP_MEMBERS: Record<SourceGroup, readonly SourceType[]> = {
  official: ["official"],
  expert: ["employee", "expert", "kol"],
  media: ["media"],
  community: ["community", "open_source_project"],
};

// Reverse index: source_type -> its group. Built once from GROUP_MEMBERS so the two never drift.
const TYPE_TO_GROUP: Record<SourceType, SourceGroup> = (() => {
  const out = {} as Record<SourceType, SourceGroup>;
  for (const group of SOURCE_GROUPS) {
    for (const member of GROUP_MEMBERS[group]) out[member] = group;
  }
  return out;
})();

const GROUP_SET: ReadonlySet<string> = new Set(SOURCE_GROUPS);

export function isSourceGroup(v: string): v is SourceGroup {
  return GROUP_SET.has(v);
}

/** The source_types belonging to a group (e.g. expert -> employee, expert, kol). */
export function groupMembers(group: SourceGroup): readonly SourceType[] {
  return GROUP_MEMBERS[group];
}

/** The group a source_type belongs to, or null for an unknown value. */
export function groupForSourceType(sourceType: string | null | undefined): SourceGroup | null {
  if (!sourceType) return null;
  return TYPE_TO_GROUP[sourceType as SourceType] ?? null;
}

/** Expand a set of groups into the flat, enum-ordered list of member source_types. */
export function expandGroups(groups: Iterable<SourceGroup>): SourceType[] {
  const wanted = new Set<SourceType>();
  for (const g of groups) for (const m of GROUP_MEMBERS[g]) wanted.add(m);
  // Preserve SOURCE_TYPES order for a stable, click-order-independent result.
  return SOURCE_TYPES.filter((t) => wanted.has(t));
}

/** Parse a comma-separated `sourceGroups`-style param into known groups (unknown dropped). */
export function parseSourceGroups(raw: string | null): SourceGroup[] | undefined {
  if (!raw) return undefined;
  const seen = new Set<SourceGroup>();
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && isSourceGroup(v)) seen.add(v);
  }
  return seen.size ? SOURCE_GROUPS.filter((g) => seen.has(g)) : undefined;
}
