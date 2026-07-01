import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const pageSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");
const feedRefreshSource = readFileSync(join(import.meta.dir, "feed-refresh-indicator.tsx"), "utf8");
const hotspotJumpSource = readFileSync(join(import.meta.dir, "current-hotspot-jump.tsx"), "utf8");
const hotspotsSource = readFileSync(join(import.meta.dir, "current-hotspots.tsx"), "utf8");
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
    expect(pageSource).toContain("loadHomeData(feedQuery, limit, canReviewAnnotations)");
    expect(pageSource).toContain("listCurrentHotspots(recent.map((event) => event.id))");
    expect(searchIndex).toBeGreaterThan(-1);
    expect(hotspotsIndex).toBeGreaterThan(-1);
    expect(feedIndex).toBeGreaterThan(-1);
    expect(searchIndex).toBeLessThan(hotspotsIndex);
    expect(hotspotsIndex).toBeLessThan(feedIndex);
    expect(cssSource).toContain(".current-hotspots {");
    expect(hotspotsSource).toContain("current-hotspots-empty");
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

  test("keeps only the overview toggle pinned to the top right of the reader content", () => {
    expect(pageSource).not.toContain("NotificationBell");
    expect(cssSource).toContain(".reader-control-strip {\n  position: absolute;");
    expect(cssSource).toContain("right: 0;");
    expect(cssSource).toContain(".reader-control-strip {\n    position: sticky;");
    expect(cssSource).toContain("--reader-control-reserve");
    expect(cssSource).toContain("max-width: calc(100% - var(--reader-control-reserve));");
  });

  test("lets the reader content fill the available width with only a small right gap", () => {
    expect(cssSource).toContain("--reader-page-right-gap: clamp(0.9rem, 2vw, 1.5rem);");
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

  test("computes current hotspots from a global recent query, independent of the feed filter", () => {
    expect(pageSource).toContain("const HOTSPOT_CANDIDATE_LIMIT = 80;");
    expect(pageSource).toContain("async function loadGlobalHotspots()");
    expect(pageSource).toContain('parsePublicQuery(new URLSearchParams("mode=all&since=week"))');
    expect(pageSource).toContain("return candidates.slice(0, limit);");
  });

  test("offers load-more pagination that keeps active filters in the URL", () => {
    expect(pageSource).toContain("const HOME_LIMIT_MAX = 5000;");
    expect(pageSource).toContain("parseHomeLimit(sp)");
    expect(pageSource).toContain('className="load-more"');
    expect(pageSource).toContain('params.set("limit", String(nextLimit));');
    expect(cssSource).toContain(".load-more {");
  });

  test("polls for new feed items with the current public query only", () => {
    expect(pageSource).toContain("function refreshQueryString");
    expect(pageSource).toContain('if (query.mode === "personalized") return null;');
    expect(pageSource).toContain('params.set("mode", query.mode === "selected" ? "selected" : "all");');
    expect(pageSource).toContain('params.set("take", "1");');
    expect(pageSource).toContain('refreshEndpoint={canReviewAnnotations ? "/api/reader/feed-peek" : "/api/public/items"}');
    expect(pageSource).toContain("const latestSortAt = latestEvent ? timelineTime(latestEvent, query.mode).toISOString() : null;");
    expect(pageSource).toContain("latestSortAt={latestSortAt}");
    expect(feedRefreshSource).toContain('refreshEndpoint = "/api/public/items"');
    expect(feedRefreshSource).toContain("nextTime <= latestTime");
  });

  test("hides already owner-reviewed events only for owner/admin triage", () => {
    expect(pageSource).toContain("canReviewOwnerAnnotations()");
    expect(pageSource).toContain("loadHomeData(feedQuery, limit, canReviewAnnotations)");
    expect(pageSource).toContain("loadOwnerAnnotations(eventIds, canReviewAnnotations)");
  });

  test("loads available category chips from the filtered database scope, not only visible cards", () => {
    expect(pageSource).toContain("listAvailableEventCategories");
    expect(pageSource).toContain("availableEventCategories");
    expect(pageSource).not.toContain("function availableCategories(events");
  });

  test("keeps the source picker usable with many long source names", () => {
    expect(cssSource).toContain("width: min(560px, calc(100vw - 2rem));");
    expect(cssSource).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));");
    expect(cssSource).toContain(".search-source-grid .chip {");
    expect(cssSource).toContain("text-overflow: ellipsis;");
  });

  test("new-feed indicator reloads the current route and returns readers to the newest card", () => {
    expect(feedRefreshSource).toContain('const LIVE_REFRESH_PARAM = "_live";');
    expect(feedRefreshSource).toContain("const POLL_INTERVAL_MS = 30_000;");
    expect(feedRefreshSource).toContain("const REFRESH_FEEDBACK_TIMEOUT_MS = 6_000;");
    expect(feedRefreshSource).toContain("usePathname");
    expect(feedRefreshSource).toContain("useSearchParams");
    expect(feedRefreshSource).toContain("const reloadingFromKeyRef = useRef<string | null>(null);");
    expect(feedRefreshSource).toContain("window.scrollTo({ top: 0, behavior: \"auto\" });");
    expect(feedRefreshSource).toContain("router.replace(refreshedHref(pathname, searchParams), { scroll: true });");
    expect(cssSource).toContain(".feed-refresh-indicator:disabled");
  });

  test("covers reader-home interaction surfaces in light theme", () => {
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-home .chip');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-home .chip:hover');
    expect(cssSource).toContain('html[data-reader-theme="light"] .bento-cell:hover .card');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-home .reaction-down.on');
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-home .reaction:hover:not(:disabled)',
    );
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-home .day-toggle:hover .day-date',
    );
  });

  test("keeps the mobile timeline visible while shrinking card density and gutters", () => {
    const mobileStart = cssSource.indexOf("/* 手机：保留窄时间轴，缩小卡片密度，速览栏仍为全宽浮层 */");
    const mobileEnd = cssSource.indexOf("/* admin dashboard responsive */", mobileStart);
    const mobileCss = cssSource.slice(mobileStart, mobileEnd);
    expect(pageSource).toContain('className="tl-date"');
    expect(pageSource).toContain("formatTimeOfDay(when)");
    expect(pageSource).not.toContain('className="tl-time"');
    expect(cssSource).toContain(".tl-date {");
    expect(cssSource).not.toContain(".tl-time");
    expect(mobileCss).toContain("width: calc(100% - 0.75rem);");
    expect(mobileCss).toContain("--tl-rail-w: 2.6rem;");
    expect(mobileCss).toContain("grid-template-columns: var(--tl-rail-w) minmax(0, 1fr);");
    expect(mobileCss).toContain(".tl-row::before {\n    display: block;");
    expect(mobileCss).toContain(".tl-dot {\n    display: block;");
    expect(mobileCss).toContain("padding: 0.5rem 0.58rem;");
    expect(mobileCss).toContain("max-height: 6.5rem;");
    expect(mobileCss).toContain("-webkit-line-clamp: 2;");
  });
});
