import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const componentSource = readFileSync(join(import.meta.dir, "reaction-buttons.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("reaction buttons", () => {
  test("keeps public useful and useless feedback in the bottom action row", () => {
    expect(componentSource).toContain('type Kind = "like" | "star" | "down"');
    expect(componentSource).toContain("initialDownCount");
    expect(componentSource).toContain("initialDowned");
    expect(componentSource).toContain("reaction-like");
    expect(componentSource).toContain("reaction-down");
    expect(componentSource).toContain('toggle("down")');
    expect(componentSource).toContain("m.like");
    expect(componentSource).toContain("m.down");
    expect(componentSource).toContain("m.downed");
    expect(componentSource).not.toContain('className="quick-feedback"');
    expect(componentSource).not.toContain("quick-feedback-button");
    expect(componentSource).not.toContain("is-positive");
  });

  test("downed state shows an undo banner wired to the same toggle", () => {
    expect(componentSource).toContain("state.downed && (");
    expect(componentSource).toContain('className="downed-banner"');
    expect(componentSource).toContain("m.downedNotice");
    expect(componentSource).toContain("m.undo");
  });

  test("a downed feed card collapses to a stub, but the detail page never collapses", () => {
    expect(cssSource).toContain(".card:not(.card-detail):has(.reaction-down.on)");
    expect(cssSource).toContain(".downed-banner");
    expect(cssSource).toContain(".card-detail .downed-banner");
  });

  test("does not keep the old hover-corner feedback affordance", () => {
    expect(cssSource).not.toContain(".quick-feedback");
    expect(cssSource).not.toContain("quick-feedback-button");
  });
});
