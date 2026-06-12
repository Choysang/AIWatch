import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const componentSource = readFileSync(join(import.meta.dir, "reaction-buttons.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("reaction buttons quick feedback", () => {
  test("supports useful and useless quick feedback on card hover", () => {
    expect(componentSource).toContain('type Kind = "like" | "star" | "down"');
    expect(componentSource).toContain("initialDownCount");
    expect(componentSource).toContain("initialDowned");
    expect(componentSource).toContain("downCount");
    expect(componentSource).toContain("downed");
    expect(componentSource).toContain('className="quick-feedback"');
    expect(componentSource).toContain("m.quickFeedback");
    expect(componentSource).toContain('toggle("like")');
    expect(componentSource).toContain('toggle("down")');
    expect(componentSource).toContain("m.down");
    expect(componentSource).toContain("m.downed");
  });

  test("reveals quick feedback only while the card is hovered or focused", () => {
    expect(cssSource).toContain(".quick-feedback");
    expect(cssSource).toContain(".card:hover .quick-feedback");
    expect(cssSource).toContain(".card:focus-within .quick-feedback");
    expect(cssSource).toContain("pointer-events: none;");
    expect(cssSource).toContain("pointer-events: auto;");
  });
});
