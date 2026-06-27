import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const appDir = import.meta.dir;
const componentPath = join(appDir, "subpage-nav.tsx");

const subpageFiles = [
  "(reader)/about/page.tsx",
  "(reader)/boards/page.tsx",
  "(reader)/changelog/page.tsx",
  "(reader)/events/[id]/page.tsx",
  "(reader)/feedback/page.tsx",
  "(reader)/me/page-content.tsx",
  "(reader)/notifications/page.tsx",
  "(reader)/recommend-source/page.tsx",
  "(reader)/reports/kind-report-page.tsx",
  "aiwatch-skill/page.tsx",
  "login/page.tsx",
];

function readAppFile(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), "utf8");
}

describe("subpage navigation", () => {
  test("offers a browser back action and a home link", () => {
    expect(existsSync(componentPath)).toBe(true);
    const source = readFileSync(componentPath, "utf8");
    expect(source).toContain("router.back()");
    expect(source).toContain('router.push("/")');
    expect(source).toContain('href="/"');
    expect(source).toContain("返回");
    expect(source).toContain("首页");
  });

  test("is present on every public subpage", () => {
    for (const file of subpageFiles) {
      expect(readAppFile(file), file).toContain("SubpageNav");
    }
    expect(readAppFile("(reader)/reports/[date]/page.tsx")).toContain("KindReportByDate");
    expect(readAppFile("(reader)/reports/kind-report-page.tsx")).toContain("SubpageNav");
  });
});
