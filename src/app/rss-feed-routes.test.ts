import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const ROUTE_FILES = [
  "src/app/feed.xml/route.ts",
  "src/app/feed/all.xml/route.ts",
  "src/app/feed/daily.xml/route.ts",
  "src/app/rss.xml/route.ts",
] as const;

describe("public RSS route aliases", () => {
  test("expose the RSS generator at the advertised feed URLs", () => {
    for (const file of ROUTE_FILES) {
      expect(readFileSync(file, "utf8")).toContain(
        'export { GET, dynamic } from "@/app/api/v1/rss/route";',
      );
    }
  });
});
