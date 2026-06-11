import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const reportsPage = readFileSync(join(import.meta.dir, "reports", "page.tsx"), "utf8");
const reportByDatePage = readFileSync(
  join(import.meta.dir, "reports", "[date]", "page.tsx"),
  "utf8",
);
const loadingPath = join(import.meta.dir, "loading.tsx");

describe("reader navigation performance", () => {
  test("caches report queries used by sidebar navigation", () => {
    expect(reportsPage).toContain('import { unstable_cache } from "next/cache";');
    expect(reportsPage).toContain("getCachedLatestDaily");
    expect(reportsPage).toContain("listCachedDailies");
    expect(reportsPage).toContain("revalidate: 300");
    expect(reportByDatePage).toContain('import { unstable_cache } from "next/cache";');
    expect(reportByDatePage).toContain("getCachedDailyByDate");
    expect(reportByDatePage).toContain("revalidate: 300");
  });

  test("has an instant skeleton fallback for reader route transitions", () => {
    expect(existsSync(loadingPath)).toBe(true);
    const loadingSource = existsSync(loadingPath) ? readFileSync(loadingPath, "utf8") : "";
    expect(loadingSource).toContain('className="skeleton-feed"');
    expect(loadingSource).toContain("SkeletonCard");
  });
});
