import { describe, expect, test } from "bun:test";
import { can, type Capability, type Role } from "./rbac";

const ALL_ROLES: Role[] = [
  "user",
  "expert",
  "moderator",
  "selected_author",
  "admin",
  "owner",
  "readonly_operator",
];

// Decision 14: public submit (no capability), moderators triage, selected-authors/admins
// approve+apply, only admin/owner apply sensitive changes, readonly inspects only.
const EXPECTED: Record<Capability, Role[]> = {
  "contribution.triage": ["moderator", "selected_author", "admin", "owner"],
  "contribution.approve": ["selected_author", "admin", "owner"],
  "contribution.apply": ["selected_author", "admin", "owner"],
  "contribution.applySensitive": ["admin", "owner"],
  "source.moderate": ["selected_author", "admin", "owner"],
  "audit.view": ["moderator", "selected_author", "admin", "owner", "readonly_operator"],
};

describe("rbac.can — capability map", () => {
  for (const [cap, allowed] of Object.entries(EXPECTED) as [Capability, Role[]][]) {
    describe(cap, () => {
      for (const role of ALL_ROLES) {
        const shouldAllow = allowed.includes(role);
        test(`${role} ${shouldAllow ? "can" : "cannot"}`, () => {
          expect(can(role, cap)).toBe(shouldAllow);
        });
      }
    });
  }

  test("plain users hold no console capability", () => {
    expect(can("user", "contribution.triage")).toBe(false);
    expect(can("user", "contribution.approve")).toBe(false);
    expect(can("user", "audit.view")).toBe(false);
  });

  test("only admin/owner may apply sensitive changes", () => {
    expect(can("selected_author", "contribution.applySensitive")).toBe(false);
    expect(can("admin", "contribution.applySensitive")).toBe(true);
    expect(can("owner", "contribution.applySensitive")).toBe(true);
  });

  test("readonly_operator can view audit but cannot act", () => {
    expect(can("readonly_operator", "audit.view")).toBe(true);
    expect(can("readonly_operator", "contribution.triage")).toBe(false);
    expect(can("readonly_operator", "contribution.apply")).toBe(false);
    expect(can("readonly_operator", "source.moderate")).toBe(false);
  });

  test("missing or unknown role is denied (fail closed)", () => {
    expect(can(null, "audit.view")).toBe(false);
    expect(can(undefined, "audit.view")).toBe(false);
    expect(can("", "audit.view")).toBe(false);
    expect(can("superuser", "contribution.apply")).toBe(false);
  });
});
