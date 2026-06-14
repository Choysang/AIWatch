// Source-string structure assertions for the topic-board reader UI (v0.5 A1.3), following
// the reader-component convention: assert the file's structure as text rather than rendering
// React. Guards the cross-file wiring (manager <-> API <-> nav <-> i18n <-> CSS).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const dir = import.meta.dir;
const managerSrc = readFileSync(join(dir, "board-manager.tsx"), "utf8");
const pageSrc = readFileSync(join(dir, "page.tsx"), "utf8");
const navSrc = readFileSync(join(dir, "..", "reader-nav-sidebar.tsx"), "utf8");
const i18nSrc = readFileSync(join(dir, "..", "..", "..", "i18n", "messages", "zh.ts"), "utf8");
const cssSrc = readFileSync(join(dir, "..", "..", "globals.css"), "utf8");

describe("topic board reader UI", () => {
  test("opening a board links to the home feed filtered by its tags", () => {
    expect(managerSrc).toContain("/?tags=");
    expect(managerSrc).toContain('encodeURIComponent(tags.join(","))');
  });

  test("board manager mutates through the boards API", () => {
    expect(managerSrc).toContain('"/api/boards"');
    expect(managerSrc).toContain("`/api/boards/${draft.id}`");
    expect(managerSrc).toContain("`/api/boards/${id}`");
    expect(managerSrc).toContain('method: isEdit ? "PATCH" : "POST"');
    expect(managerSrc).toContain('method: "DELETE"');
  });

  test("board manager offers a tag picker (popular chips + free text)", () => {
    expect(managerSrc).toContain("popularTags");
    expect(managerSrc).toContain("toggleTag");
    expect(managerSrc).toContain("addTag");
  });

  test("the page resolves identity server-side and renders the manager with SubpageNav", () => {
    expect(pageSrc).toContain("resolveReaderIdentityServer");
    expect(pageSrc).toContain("listBoards");
    expect(pageSrc).toContain("listPopularTags");
    expect(pageSrc).toContain("<BoardManager");
    expect(pageSrc).toContain("SubpageNav");
  });

  test("the sidebar surfaces a 主题板 entry and prefetches /boards", () => {
    expect(navSrc).toContain('href="/boards"');
    expect(navSrc).toContain('name="boards"');
    expect(navSrc).toContain('router.prefetch("/boards")');
    expect(navSrc).toContain("messages.nav.boards");
  });

  test("i18n + CSS back the board UI", () => {
    expect(i18nSrc).toContain("boards: {");
    expect(i18nSrc).toContain('boards: "主题板"');
    expect(cssSrc).toContain(".board-grid {");
    expect(cssSrc).toContain(".board-card {");
    expect(cssSrc).toContain(".board-open {");
  });
});
