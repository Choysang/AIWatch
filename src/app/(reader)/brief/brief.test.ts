// Source-string structure assertions for the 主题简报 page (v0.5 B2), following the reader-
// component convention: assert cross-file wiring as text rather than rendering React.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const dir = import.meta.dir;
const pageSrc = readFileSync(join(dir, "page.tsx"), "utf8");
const managerSrc = readFileSync(join(dir, "..", "boards", "board-manager.tsx"), "utf8");
const homeSrc = readFileSync(join(dir, "..", "page.tsx"), "utf8");
const i18nSrc = readFileSync(join(dir, "..", "..", "..", "i18n", "messages", "zh.ts"), "utf8");
const cssSrc = readFileSync(join(dir, "..", "..", "globals.css"), "utf8");

describe("主题简报 page (B2)", () => {
  test("assembles the brief query-time from the interest params via the shared engine", () => {
    expect(pageSrc).toContain("buildBoardBrief");
    expect(pageSrc).toContain("parseInterests");
    expect(pageSrc).toContain("<ReportView");
  });

  test("offers daily/weekly/monthly kind tabs that preserve the interest", () => {
    expect(pageSrc).toContain('const KINDS: ReportKind[] = ["daily", "weekly", "monthly"]');
    expect(pageSrc).toContain("brief-kind-tab");
    expect(pageSrc).toContain('href={`/brief?${params.toString()}`}');
  });

  test("falls back to a hint when no interest is supplied", () => {
    expect(pageSrc).toContain("if (!interest)");
    expect(pageSrc).toContain("m.noInterest");
  });

  test("board cards link to the brief; the home banner surfaces it too", () => {
    expect(managerSrc).toContain("briefHref");
    expect(managerSrc).toContain('`/brief?${params.toString()}`');
    expect(managerSrc).toContain("className=\"board-brief\"");
    expect(homeSrc).toContain("briefQuery");
    expect(homeSrc).toContain("/brief?");
    expect(homeSrc).toContain("m.home.boardFilterBrief");
  });

  test("i18n + CSS back the brief", () => {
    expect(i18nSrc).toContain("brief: {");
    expect(i18nSrc).toContain('heading: "主题简报"');
    expect(i18nSrc).toContain("boardFilterBrief:");
    expect(cssSrc).toContain(".brief-kind-tab.is-active {");
    expect(cssSrc).toContain(".board-brief {");
  });
});
