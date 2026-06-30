import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "admin-dashboard.ts"), "utf8");
const pageSource = readFileSync(
  join(import.meta.dir, "..", "..", "app", "%5Fadmin", "page.tsx"),
  "utf8",
);

describe("admin dashboard query", () => {
  test("shows the latest daily update row first", () => {
    expect(source).toContain("ORDER BY days.day DESC");
    expect(pageSource).toContain("data.daily.map");
    expect(pageSource).not.toContain("data.daily.reverse");
  });
});
