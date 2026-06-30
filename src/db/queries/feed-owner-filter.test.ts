import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "feed.ts"), "utf8");

describe("feed owner-annotation filtering", () => {
  test("keeps public feeds on not-useful filtering and owner/admin triage on all reviewed filtering", () => {
    expect(source).toContain("hideOwnerAnnotated?: boolean");
    expect(source).toContain("filter.hideOwnerAnnotated");
    expect(source).toContain("and ${ownerAnnotations.verdict} = 'not_useful'");
  });
});
