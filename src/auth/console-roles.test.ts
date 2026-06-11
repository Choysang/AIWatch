import { describe, expect, test } from "bun:test";
import { isAdminRole, isConsoleRole } from "./console-roles";

describe("console role gates", () => {
  test("only owner and admin can enter the admin console", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);

    for (const role of ["user", "expert", "moderator", "selected_author", "readonly_operator"]) {
      expect(isAdminRole(role)).toBe(false);
      expect(isConsoleRole(role)).toBe(false);
    }
  });

  test("missing and unknown roles fail closed", () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole("superuser")).toBe(false);
  });
});
