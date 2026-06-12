import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const trackerSource = readFileSync(join(import.meta.dir, "event-view-tracker.tsx"), "utf8");
const collapsibleSource = readFileSync(join(import.meta.dir, "collapsible-group.tsx"), "utf8");

describe("event card location hooks", () => {
  test("gives feed cards stable anchors for in-page sidebar jumps", () => {
    expect(trackerSource).toContain('id={`event-${eventId}`}');
    expect(trackerSource).toContain("data-event-id={eventId}");
    expect(trackerSource).toContain("tabIndex={-1}");
  });

  test("opens folded timeline groups before scrolling to a card", () => {
    expect(collapsibleSource).toContain("aiwatch:reveal-event-card");
    expect(collapsibleSource).toContain("setCollapsed(false)");
  });
});
