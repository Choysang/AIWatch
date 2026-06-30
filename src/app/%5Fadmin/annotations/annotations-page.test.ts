import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const pageSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("owner annotation admin page", () => {
  test("explains the source x content-type preference impact", () => {
    expect(pageSource).toContain("信源×内容类型亲和度");
    expect(pageSource).toContain("sourceContentTypeLabel");
    expect(pageSource).toContain("profile.sourceContentType");
    expect(pageSource).toContain("信源×内容");
  });
});
