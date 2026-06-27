import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const searchSource = readFileSync(join(import.meta.dir, "search-bar.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("search bar responsiveness", () => {
  test("wraps search navigation in a transition with immediate busy feedback", () => {
    expect(searchSource).toContain("useTransition");
    expect(searchSource).toContain("startTransition");
    expect(searchSource).toContain("aria-busy={isPending}");
    expect(searchSource).toContain('className={`search ${isPending ? "is-pending" : ""}`}');
    expect(searchSource).not.toContain("router.prefetch(href)");
    expect(searchSource).toContain("router.push(href)");
  });

  test("does not mirror query params into input state through effects", () => {
    expect(searchSource).not.toContain("useEffect");
    expect(searchSource).toContain("draftValue");
  });

  test("omits explicit all filter chips because empty selection means all", () => {
    expect(searchSource).toContain('const WINDOWS = ["today", "week", "month", "all"] as const;');
    expect(searchSource).toContain('const SEARCH_MODES = ["latest", "selected", "personalized"] as const;');
    expect(searchSource).toContain('modeParam === "selected"');
    expect(searchSource).toContain('if (value === "selected") next.set("mode", "selected");');
    expect(searchSource).toContain('else next.delete("mode");');
    expect(searchSource).toContain("const toggleEventCategory");
    expect(searchSource).not.toContain("clearEventCategory");
    expect(searchSource).not.toContain("{m.eventCategoryAll}");
  });

  test("offers a 推荐 (personalized) mode wired to mode=personalized (v0.5 A3)", () => {
    expect(searchSource).toContain('modeParam === "personalized"');
    expect(searchSource).toContain('else if (value === "personalized") next.set("mode", "personalized");');
  });

  test("gates the 推荐 tab behind having topic boards (v0.5 B)", () => {
    expect(searchSource).toContain("hasBoards");
    expect(searchSource).toContain("const visibleModes");
    expect(searchSource).toContain('SEARCH_MODES.filter((value) => value !== "personalized")');
    expect(searchSource).toContain("visibleModes.map");
  });

  test("keeps mode tabs above a left-aligned filter/search row", () => {
    const mainRowStart = searchSource.indexOf('className="search-main-row"');
    const modeTabsIndex = searchSource.indexOf('className="search-mode-tabs"');
    const filterLineIndex = searchSource.indexOf('className="search-filter-line"');
    const actionRowIndex = searchSource.indexOf('className="search-row search-action-row"');
    const inputIndex = searchSource.indexOf('className="search-input"');
    const popoverIndex = searchSource.indexOf('className="search-filter-popover"');

    expect(mainRowStart).toBeGreaterThan(-1);
    expect(modeTabsIndex).toBeGreaterThan(mainRowStart);
    expect(filterLineIndex).toBeGreaterThan(modeTabsIndex);
    expect(actionRowIndex).toBeGreaterThan(filterLineIndex);
    expect(inputIndex).toBeGreaterThan(actionRowIndex);
    expect(popoverIndex).toBeGreaterThan(inputIndex);
    expect(cssSource).toContain(".search-main-row {\n  display: grid;");
    expect(cssSource).toContain(".search-filter-line {\n  flex: 1 1 auto;");
    expect(cssSource).toContain("justify-content: flex-start;");
    expect(cssSource).toContain(".search-mode-tab::after");
    expect(cssSource).toContain(".search-mode-tab.is-active::after {\n  background: rgb(255 170 24);");
    expect(searchSource).toContain('className="search-category-actions"');
    expect(cssSource).toContain(".search-category-actions {\n  display: flex;");
    expect(cssSource).toContain(".search-action-row {\n  flex: 0 1 auto;");
    expect(cssSource).toContain("margin-left: 0;");
    expect(cssSource).toContain("width: clamp(8.5rem, 12vw, 12rem);");
    expect(cssSource).toContain("padding: 0.37rem 0.58rem;");
    expect(cssSource).toContain(".search-input:focus,\n.search-action-row:focus-within .search-input");
  });

  test("keeps time and score inside the filter panel", () => {
    expect(searchSource).toContain("search-mode-tabs");
    expect(searchSource).toContain("search-filter-panel");
    expect(searchSource).toContain('name="minScore"');
    expect(searchSource).toContain('placeholder="不限"');
    expect(searchSource).toContain("applyPanelFilters");
    expect(searchSource).toContain("clearPanelFilters");
    expect(searchSource).toContain("m.filterButton");
    expect(searchSource).not.toContain('aria-label={m.windowLabel}>\n        <span className="filter-label">{m.windowLabel}</span>');
  });

  test("opens the filter panel as a popover anchored to the filter button", () => {
    const actionRowStart = searchSource.indexOf('className="search-row search-action-row"');
    const popoverIndex = searchSource.indexOf('className="search-filter-popover"');
    const panelIndex = searchSource.indexOf('id="reader-search-filter-panel"');
    const formEnd = searchSource.indexOf("</form>", actionRowStart);

    expect(actionRowStart).toBeGreaterThan(-1);
    expect(popoverIndex).toBeGreaterThan(actionRowStart);
    expect(panelIndex).toBeGreaterThan(popoverIndex);
    expect(panelIndex).toBeLessThan(formEnd);
    expect(cssSource).toContain(".search-filter-popover {\n  position: relative;");
    expect(cssSource).toContain(".search-filter-panel {\n  position: absolute;");
    expect(cssSource).toContain("top: calc(100% + 0.55rem);");
    expect(cssSource).toContain("right: 0;");
  });

  test("filter panel surfaces the recommend-source entry (信源推荐收集 slice A)", () => {
    expect(searchSource).toContain('className="search-filter-recommend"');
    expect(searchSource).toContain('href="/recommend-source"');
    expect(searchSource).toContain("m.recommendSourceHint");
    expect(searchSource).toContain("m.recommendSourceLink");
    expect(cssSource).toContain(".search-filter-recommend {");
  });

  test("search deck stacks above the hotspots panel so the open filter box is never covered", () => {
    const deck = cssSource.indexOf(".reader-home .search {");
    expect(deck).toBeGreaterThan(-1);
    const deckBlock = cssSource.slice(deck, cssSource.indexOf("}", deck));
    expect(deckBlock).toContain("position: relative;");
    expect(deckBlock).toContain("z-index: 10;");
  });

  test("offers an explicit search submit button (click + Enter both search)", () => {
    expect(searchSource).toContain("onSubmit={submitQuery}");
    expect(searchSource).toContain('<button type="submit" className="search-go">');
    expect(cssSource).toContain(".search-go {");
  });

  test("collapses mobile category filters into the filter panel and gives the panel viewport width", () => {
    expect(searchSource).toContain("search-filter-mobile-section");
    expect(cssSource).toContain(".search-category-actions > .search-facet-row {\n    display: none;");
    expect(cssSource).toContain(".search-filter-popover {\n    position: static;");
    expect(cssSource).toContain("left: 0.65rem;\n    right: 0.65rem;\n    width: auto;");
    expect(cssSource).toContain("max-height: min(72vh, 34rem);");
  });
});
