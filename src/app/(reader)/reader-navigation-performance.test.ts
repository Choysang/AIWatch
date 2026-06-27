import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// The daily list page now delegates to the shared day/week/month skeleton, so its report
// query caching (revalidate 300, for snappy sidebar navigation) lives in kind-report-page.tsx.
const kindReportPage = readFileSync(join(import.meta.dir, "reports", "kind-report-page.tsx"), "utf8");
const reportByDatePage = readFileSync(
  join(import.meta.dir, "reports", "[date]", "page.tsx"),
  "utf8",
);
const loadingPath = join(import.meta.dir, "loading.tsx");

describe("reader navigation performance", () => {
  test("caches report queries used by sidebar navigation", () => {
    expect(kindReportPage).toContain('import { unstable_cache } from "next/cache";');
    expect(kindReportPage).toContain("getCachedLatest");
    expect(kindReportPage).toContain("listCached");
    expect(kindReportPage).toContain("revalidate: 300");
    expect(kindReportPage).toContain("getCachedByDate");
    expect(kindReportPage).toContain("getByKindAndDate");
    expect(reportByDatePage).toContain("KindReportByDate");
  });

  test("has an instant skeleton fallback for reader route transitions", () => {
    expect(existsSync(loadingPath)).toBe(true);
    const loadingSource = existsSync(loadingPath) ? readFileSync(loadingPath, "utf8") : "";
    expect(loadingSource).toContain('className="skeleton-feed"');
    expect(loadingSource).toContain("SkeletonCard");
  });
});
