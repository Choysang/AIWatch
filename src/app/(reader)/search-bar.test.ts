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
    expect(searchSource).toContain("router.prefetch(href)");
  });

  test("does not mirror query params into input state through effects", () => {
    expect(searchSource).not.toContain("useEffect");
    expect(searchSource).toContain("draftValue");
  });

  test("omits explicit all filter chips because empty selection means all", () => {
    expect(searchSource).toContain('const WINDOWS = ["today", "week", "month", "all"] as const;');
    expect(searchSource).toContain('const SEARCH_MODES = ["latest", "selected"] as const;');
    expect(searchSource).toContain(
      'const mode: SearchMode = params.get("mode") === "selected" ? "selected" : "latest";',
    );
    expect(searchSource).toContain('if (value === "latest") next.delete("mode");');
    expect(searchSource).toContain("const toggleEventCategory");
    expect(searchSource).not.toContain("clearEventCategory");
    expect(searchSource).not.toContain("{m.eventCategoryAll}");
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
});
