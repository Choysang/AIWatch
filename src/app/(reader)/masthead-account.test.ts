import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const accountSource = readFileSync(join(import.meta.dir, "masthead-account.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("notification bell responsiveness", () => {
  test("prefetches the inbox route on user intent and dedupes hover preview requests", () => {
    expect(accountSource).toContain('router.prefetch("/notifications")');
    expect(accountSource).toContain("const prepareNotifications");
    expect(accountSource).toContain("previewLoading");
    expect(accountSource).toContain("if (items !== null || previewLoading.current) return;");
  });

  test("notification bell and hover preview use theme tokens", () => {
    expect(cssSource).toMatch(/\.masthead-bell\s*\{[^}]*background:\s*var\(--paper-raised\)/);
    expect(cssSource).toMatch(
      /\.masthead-notification-preview\s*\{[^}]*background:\s*var\(--paper-raised\)/,
    );
    expect(cssSource).toMatch(/\.masthead-notification-preview\s*\{[^}]*color:\s*var\(--ink\)/);
  });
});
