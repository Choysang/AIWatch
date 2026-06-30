import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const pageSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("admin source fault desk", () => {
  test("shows explicit RSSHub, X token, email alert, and one-click retest signals", () => {
    expect(pageSource).toContain("function SourceFaultDesk");
    expect(pageSource).toContain("loadRuntimeFaultStatus");
    expect(pageSource).toContain("RSSHub 状态 / 异常源");
    expect(pageSource).toContain("X token / 异常源");
    expect(pageSource).toContain("TWITTER_AUTH_TOKEN");
    expect(pageSource).toContain("RESEND_API_KEY");
    expect(pageSource).toContain('value="retry"');
  });
});
