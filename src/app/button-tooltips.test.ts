import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const tooltipSource = readFileSync(join(import.meta.dir, "button-tooltips.tsx"), "utf8");
const layoutSource = readFileSync(join(import.meta.dir, "layout.tsx"), "utf8");

describe("button tooltips", () => {
  test("adds a global native tooltip fallback for buttons without explicit titles", () => {
    expect(tooltipSource).toContain("closest(\"button\")");
    expect(tooltipSource).toContain("pointerover");
    expect(tooltipSource).toContain("focusin");
    expect(tooltipSource).toContain("aria-label");
    expect(layoutSource).toContain("<ButtonTooltips />");
  });
});
