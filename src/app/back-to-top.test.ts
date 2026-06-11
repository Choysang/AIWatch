import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "back-to-top.tsx"), "utf8");
const layoutSource = readFileSync(join(import.meta.dir, "layout.tsx"), "utf8");

describe("back to top button", () => {
  test("is a global fixed bottom-right control with a visible tooltip", () => {
    expect(source).toContain('className="back-to-top"');
    expect(source).toContain("window.scrollTo({ top: 0");
    expect(source).toContain("回到顶部");
    expect(source).toContain('className="back-to-top-tooltip"');
    expect(source).toContain("position: fixed;");
    expect(source).toContain("right: clamp(");
    expect(source).toContain("bottom: clamp(");
    expect(source).toContain('className="back-to-top-icon"');
    expect(source).toContain("width: 26px;");
    expect(source).toContain("height: 26px;");
    expect(source).toContain(".back-to-top:hover .back-to-top-tooltip");
  });

  test("is mounted from the root app layout", () => {
    expect(layoutSource).toContain('import { BackToTop } from "./back-to-top";');
    expect(layoutSource).toContain("<BackToTop />");
  });

  test("has explicit light theme styles for the button and tooltip", () => {
    expect(source).toContain('html[data-reader-theme="light"] .back-to-top');
    expect(source).toContain('html[data-reader-theme="light"] .back-to-top:hover');
    expect(source).toContain('html[data-reader-theme="light"] .back-to-top-tooltip');
  });
});
