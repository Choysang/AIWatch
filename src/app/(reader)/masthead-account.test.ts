import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const accountSource = readFileSync(join(import.meta.dir, "masthead-account.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("masthead account", () => {
  test("keeps notifications out of the reader top controls", () => {
    expect(accountSource).not.toContain("NotificationBell");
    expect(accountSource).not.toContain("masthead-bell");
    expect(cssSource).not.toContain(".masthead-bell");
    expect(cssSource).not.toContain(".masthead-notification-preview");
  });

  test("still renders the account cluster for authenticated readers", () => {
    expect(accountSource).toContain("export function MastheadAccount()");
    expect(accountSource).toContain("authClient.useSession()");
    expect(accountSource).toContain("isConsoleRole");
    expect(accountSource).toContain("authClient.signOut()");
    expect(cssSource).toContain(".masthead-account {");
  });
});
