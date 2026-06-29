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
    expect(cssSource).toContain("grid-template-columns: minmax(13rem, 18rem) minmax(0, 920px) minmax(0, 1fr);");
    expect(cssSource).toContain(".report-archive-shell {\n  grid-column: 1;");
    expect(cssSource).toContain("align-self: start;");
    expect(cssSource).toContain("position: sticky;");
    expect(cssSource).toContain("height: fit-content;");
    expect(cssSource).toContain(".report-page-main {\n  grid-column: 2;");
  });
});
