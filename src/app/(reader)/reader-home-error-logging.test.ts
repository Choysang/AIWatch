import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const pageSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("reader home error logging", () => {
  test("does not emit handled feed query failures as raw server errors", () => {
    expect(pageSource).not.toContain('log.error("[reader] loadEvents failed", error)');
    expect(pageSource).toContain('log.warn("[reader] loadEvents unavailable"');
  });
});
