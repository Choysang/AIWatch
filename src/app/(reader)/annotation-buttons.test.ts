import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const componentSource = readFileSync(join(import.meta.dir, "annotation-buttons.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("owner annotation buttons", () => {
  test("hide feed cards after an owner/admin event verdict is saved", () => {
    expect(componentSource).toContain('subjectType === "event" && target');
    expect(componentSource).toContain('closest(".card:not(.card-detail)")');
    expect(componentSource).toContain('classList.add("is-owner-reviewed")');
    expect(cssSource).toContain(".card:not(.card-detail).is-owner-reviewed");
    expect(cssSource).toContain("display: none;");
  });
});
