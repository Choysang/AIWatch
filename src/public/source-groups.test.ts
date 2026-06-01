// Unit tests for the reader-facing source-type grouping. The critical invariant: the four
// groups partition the seven DB source_types exactly — every type maps to exactly one group,
// and no group references a non-existent type. A drift here silently hides sources from a facet.

import { describe, expect, test } from "bun:test";
import { SOURCE_TYPES, type SourceType } from "./query";
import {
  GROUP_MEMBERS,
  SOURCE_GROUPS,
  expandGroups,
  groupForSourceType,
  groupMembers,
  isSourceGroup,
  parseSourceGroups,
  type SourceGroup,
} from "./source-groups";

describe("source-groups partition", () => {
  test("the four groups partition all seven source_types exactly once", () => {
    const members = SOURCE_GROUPS.flatMap((g) => [...GROUP_MEMBERS[g]]);
    // No duplicates across groups.
    expect(new Set(members).size).toBe(members.length);
    // Covers every DB source_type, and nothing extra.
    expect([...members].sort()).toEqual([...SOURCE_TYPES].sort());
  });

  test("every source_type resolves to its documented group", () => {
    const expected: Record<SourceType, SourceGroup> = {
      official: "official",
      employee: "expert",
      expert: "expert",
      kol: "expert",
      media: "media",
      community: "community",
      open_source_project: "community",
    };
    for (const t of SOURCE_TYPES) expect(groupForSourceType(t)).toBe(expected[t]);
  });

  test("groupForSourceType returns null for unknown / empty", () => {
    expect(groupForSourceType("nonsense")).toBeNull();
    expect(groupForSourceType(null)).toBeNull();
    expect(groupForSourceType(undefined)).toBeNull();
  });
});

describe("expandGroups", () => {
  test("expands expert to its three member types in enum order", () => {
    expect(expandGroups(["expert"])).toEqual(["employee", "expert", "kol"]);
  });

  test("expands multiple groups, de-duped and enum-ordered regardless of input order", () => {
    expect(expandGroups(["community", "official"])).toEqual([
      "official",
      "community",
      "open_source_project",
    ]);
  });

  test("empty input expands to empty", () => {
    expect(expandGroups([])).toEqual([]);
  });
});

describe("parsing helpers", () => {
  test("isSourceGroup guards membership", () => {
    expect(isSourceGroup("expert")).toBe(true);
    expect(isSourceGroup("kol")).toBe(false); // kol is a source_type, not a group
  });

  test("parseSourceGroups keeps known groups in enum order, drops unknown", () => {
    expect(parseSourceGroups("community,official,bogus")).toEqual(["official", "community"]);
    expect(parseSourceGroups("")).toBeUndefined();
    expect(parseSourceGroups(null)).toBeUndefined();
  });

  test("groupMembers returns the member list", () => {
    expect(groupMembers("community")).toEqual(["community", "open_source_project"]);
  });
});
