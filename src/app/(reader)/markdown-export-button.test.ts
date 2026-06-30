import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const readerDir = import.meta.dir;
const buttonPath = join(readerDir, "markdown-export-button.tsx");
const detailPagePath = join(readerDir, "events", "[id]", "page.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("markdown export button", () => {
  test("defines requested frontmatter fields and browser download flow", () => {
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
    expect(source).toContain('download = `${slugify(title)}.md`');
  });

  test("is wired into the event detail original actions row", () => {
    const pageSource = read(detailPagePath);
    expect(pageSource).toContain("MarkdownExportButton");
    expect(pageSource).toContain('<div className="original-actions">');
  });
});
