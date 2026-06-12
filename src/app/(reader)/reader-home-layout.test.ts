import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const pageSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");
const hotspotJumpSource = readFileSync(join(import.meta.dir, "current-hotspot-jump.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("reader home layout", () => {
  test("puts the primary controls and search before the feed so the page starts with useful UI", () => {
    const controlsIndex = pageSource.indexOf('className="reader-control-strip"');
    const searchIndex = pageSource.indexOf("<SearchBar");
    const feedIndex = pageSource.indexOf('className="feed"');

    expect(controlsIndex).toBeGreaterThan(-1);
    expect(searchIndex).toBeGreaterThan(-1);
    expect(feedIndex).toBeGreaterThan(-1);
    expect(controlsIndex).toBeLessThan(searchIndex);
    expect(searchIndex).toBeLessThan(feedIndex);
  });

  test("places the current hotspots block between search and the timeline cards", () => {
    const searchIndex = pageSource.indexOf("<SearchBar");
    const hotspotsIndex = pageSource.indexOf("<CurrentHotspots");
    const feedIndex = pageSource.indexOf('className="feed"');

    expect(pageSource).toContain('import { CurrentHotspots } from "./current-hotspots"');
    expect(pageSource).toContain("loadHomeData(query, limit)");
    expect(pageSource).toContain("listCurrentHotspots(candidates.map((event) => event.id))");
    expect(searchIndex).toBeGreaterThan(-1);
    expect(hotspotsIndex).toBeGreaterThan(-1);
    expect(feedIndex).toBeGreaterThan(-1);
    expect(searchIndex).toBeLessThan(hotspotsIndex);
    expect(hotspotsIndex).toBeLessThan(feedIndex);
    expect(cssSource).toContain(".current-hotspots {");
    expect(cssSource).toContain(".current-hotspots-source-trigger:hover .current-hotspots-source-list");
  });

  test("current hotspots reveal the matching card instead of navigating to detail", () => {
    expect(hotspotJumpSource).toContain('"use client"');
    expect(hotspotJumpSource).toContain("aiwatch:reveal-event-card");
    expect(hotspotJumpSource).toContain("scrollIntoView");
    expect(hotspotJumpSource).not.toContain("window.location");
    expect(hotspotJumpSource).not.toContain("/events/");
  });

  test("does not render the old homepage masthead between search and cards", () => {
    expect(pageSource).not.toContain('className="masthead"');
  });

  test("renders the global reader navigation before page controls", () => {
    const navIndex = pageSource.indexOf("<ReaderNavSidebar />");
    const controlsIndex = pageSource.indexOf('className="reader-control-strip"');

    expect(navIndex).toBeGreaterThan(-1);
    expect(controlsIndex).toBeGreaterThan(-1);
    expect(navIndex).toBeLessThan(controlsIndex);
  });

  test("keeps the sidebar toggle and notification bell pinned to the top right of the reader content", () => {
    expect(cssSource).toContain(".reader-control-strip {\n  position: absolute;");
    expect(cssSource).toContain("right: 0;");
    expect(cssSource).toContain("--reader-control-reserve");
    expect(cssSource).toContain("max-width: calc(100% - var(--reader-control-reserve));");
  });

  test("lets the reader content fill the available width with only a small right gap", () => {
    expect(cssSource).toContain("--reader-page-right-gap: min(5vw, 1.25rem);");
    // 点8：右侧速览栏展开时占据布局空间 — 宽度计算包含 --reader-sidebar-reserve
    expect(cssSource).toContain("var(--reader-sidebar-reserve, 0px)");
    expect(cssSource).toContain(
      "margin-right: calc(var(--reader-page-right-gap) + var(--reader-sidebar-reserve, 0px));",
    );
    expect(cssSource).not.toContain("width: min(\n    1160px,");
  });

  test("only loads top comments for cards that can render comment highlights", () => {
    expect(pageSource).toContain("const commentEventIds: string[] = [];");
    expect(pageSource).toContain('event.selectedLevel === "A" || event.selectedLevel === "S"');
    expect(pageSource).toContain("loadTopComments(commentEventIds)");
  });

  test("uses one feed query for timeline events and hotspot candidates", () => {
    expect(pageSource).toContain("const HOTSPOT_CANDIDATE_LIMIT = 80;");
    expect(pageSource).toContain("Math.max(limit, HOTSPOT_CANDIDATE_LIMIT)");
    expect(pageSource).toContain("const events = candidates.slice(0, limit);");
    expect(pageSource).not.toContain("Promise.all([loadEvents(query), loadHotspots(query)])");
  });

  test("offers load-more pagination that keeps active filters in the URL", () => {
    expect(pageSource).toContain("const HOME_LIMIT_MAX = 150;");
    expect(pageSource).toContain("parseHomeLimit(sp)");
    expect(pageSource).toContain('className="load-more"');
    expect(pageSource).toContain('params.set("limit", String(nextLimit));');
    expect(cssSource).toContain(".load-more {");
  });

  test("covers reader-home interaction surfaces in light theme", () => {
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-home .chip');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-home .chip:hover');
    expect(cssSource).toContain('html[data-reader-theme="light"] .bento-cell:hover .card');
    expect(cssSource).toContain('html[data-reader-theme="light"] .quick-feedback');
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-home .reaction:hover:not(:disabled)',
    );
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-home .day-toggle:hover .day-date',
    );
  });
});
