import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const componentSource = readFileSync(join(import.meta.dir, "reaction-buttons.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("reaction buttons quick feedback (方案B)", () => {
  test("keeps a single 不感兴趣 button in the hover corner — no duplicate top 👍", () => {
    expect(componentSource).toContain('type Kind = "like" | "star" | "down"');
    expect(componentSource).toContain("initialDownCount");
    expect(componentSource).toContain("initialDowned");
    expect(componentSource).toContain('className="quick-feedback"');
    expect(componentSource).toContain("m.quickFeedback");
    expect(componentSource).toContain('toggle("down")');
    expect(componentSource).toContain("m.down");
    expect(componentSource).toContain("m.downed");
    // 方案B: the corner hosts only the negative button; positive feedback lives in
    // the bottom ♥/★ row, so the corner 👍 (is-positive) must not come back.
    expect(componentSource).not.toContain("is-positive");
    expect(componentSource.match(/quick-feedback-button is-/g)).toHaveLength(1);
  });

  test("downed state shows an undo banner wired to the same toggle", () => {
    expect(componentSource).toContain("state.downed && (");
    expect(componentSource).toContain('className="downed-banner"');
    expect(componentSource).toContain("m.downedNotice");
    expect(componentSource).toContain("m.undo");
  });

  test("a downed feed card collapses to a stub, but the detail page never collapses", () => {
    expect(cssSource).toContain(".card:not(.card-detail):has(.quick-feedback-button.is-negative.on)");
    expect(cssSource).toContain(".downed-banner");
    expect(cssSource).toContain(".card-detail .downed-banner");
  });

  test("reveals quick feedback only while the card is hovered or focused", () => {
    expect(cssSource).toContain(".quick-feedback");
    expect(cssSource).toContain(".card:hover .quick-feedback");
    expect(cssSource).toContain(".card:focus-within .quick-feedback");
    expect(cssSource).toContain("pointer-events: none;");
    expect(cssSource).toContain("pointer-events: auto;");
  });
});
