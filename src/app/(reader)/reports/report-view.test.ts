import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const reportViewSource = readFileSync(join(import.meta.dir, "report-view.tsx"), "utf8");
const kindPageSource = readFileSync(join(import.meta.dir, "kind-report-page.tsx"), "utf8");

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
    expect(kindPageSource).toContain("report-archive-shell");
    expect(kindPageSource).toContain("report-archive-month");
    expect(kindPageSource).toContain("item_count");
    expect(kindPageSource).toContain("activeDate={latest?.date ?? null}");
    expect(kindPageSource).toContain("activeDate={date}");
    expect(kindPageSource).toContain("KindReportByDate");
  });
});
