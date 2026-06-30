import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const reportViewSource = readFileSync(join(import.meta.dir, "report-view.tsx"), "utf8");
const kindPageSource = readFileSync(join(import.meta.dir, "kind-report-page.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "..", "globals.css"), "utf8");

describe("report reader layout", () => {
  test("places the reading path before the report sections", () => {
    const readingPathIndex = reportViewSource.indexOf("report-reading-path");
    const sectionsIndex = reportViewSource.indexOf("report.sections.map");

    expect(readingPathIndex).toBeGreaterThan(-1);
    expect(sectionsIndex).toBeGreaterThan(-1);
    expect(readingPathIndex).toBeLessThan(sectionsIndex);
  });

  test("renders the report archive from both latest and date pages", () => {
    expect(kindPageSource).toContain("function ReportArchive");
    expect(kindPageSource).toContain('className="page report-page"');
    expect(kindPageSource).toContain("report-archive-shell");
    expect(kindPageSource).toContain("report-archive-month");
    expect(kindPageSource).toContain("item_count");
    expect(kindPageSource).toContain("activeDate={latest?.date ?? null}");
    expect(kindPageSource).toContain("activeDate={date}");
    expect(kindPageSource).toContain("KindReportByDate");
  });

  test("keeps the archive in the left rail without stealing the report body width", () => {
    expect(cssSource).toContain(".report-page {");
    expect(cssSource).toContain(".report-page-layout {\n  position: relative;");
    expect(cssSource).toContain("max-width: 920px;");
    expect(cssSource).toContain("@media (min-width: 1240px) {\n  .report-archive-shell {");
    expect(cssSource).toContain("position: fixed;");
    expect(cssSource).toContain("top: 7rem;");
    expect(cssSource).toContain("left: clamp(1rem, 1.8vw, 1.75rem);");
    expect(cssSource).toContain("width: clamp(7.5rem, calc((100vw - 920px) / 2 - 2.75rem), 14rem);");
    expect(cssSource).toContain("overscroll-behavior: contain;");
    expect(cssSource).toContain(".report-page-main {\n  min-width: 0;\n  width: 100%;");
  });
});
