import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const readerDir = import.meta.dir;
const buttonPath = join(readerDir, "markdown-export-button.tsx");
const detailPagePath = join(readerDir, "events", "[id]", "page.tsx");
const markdownRoutePath = join(readerDir, "events", "[id]", "markdown", "route.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("markdown export button", () => {
  test("defines requested frontmatter fields and multi-format browser download flow", () => {
    expect(existsSync(buttonPath)).toBe(true);
    const source = read(buttonPath);
    expect(source).toContain("title:");
    expect(source).toContain("date:");
    expect(source).toContain("source:");
    expect(source).toContain("category:");
    expect(source).toContain("tags:");
    expect(source).toContain("score:");
    expect(source).toContain("selected:");
    expect(source).toContain("source_url:");
    expect(source).toContain("aiwatch_url:");
    expect(source).toContain("Blob");
    expect(source).toContain("URL.createObjectURL");
    expect(source).toContain("download.download = `${slugify(props.title)}.${info.ext}`");
    expect(source).toContain("- 来源：");
    expect(source).toContain("- 发布时间：");
    expect(source).toContain("- AIWatch 分数：");
    expect(source).toContain("- AIWatch 标记：");
    expect(source).toContain("- AIWatch 链接：");
    expect(source).toContain("- 原文链接：");
    expect(source).toContain("## AI 摘要");
    expect(source).toContain("## 正文");
  });

  test("is wired into the event detail original actions row", () => {
    const pageSource = read(detailPagePath);
    expect(pageSource).toContain("MarkdownExportButton");
    expect(pageSource).toContain("bodyText={originalText}");
    expect(pageSource).toContain("ShareButton");
    expect(pageSource).toContain('/markdown');
    expect(pageSource).toContain('<div className="original-actions">');
  });

  test("offers a stable server-side standard Markdown download endpoint", () => {
    expect(existsSync(markdownRoutePath)).toBe(true);
    const routeSource = read(markdownRoutePath);
    expect(routeSource).toContain("text/markdown; charset=utf-8");
    expect(routeSource).toContain("content-disposition");
    expect(routeSource).toContain("- AIWatch 链接：");
    expect(routeSource).toContain("## 正文");
  });
});
