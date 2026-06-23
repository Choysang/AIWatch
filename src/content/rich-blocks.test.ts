import { describe, expect, test } from "bun:test";
import { htmlToBlocks, proxiedImageUrl, type RichBlock } from "./rich-blocks";

const BASE = "https://blog.example.com/post";

function only<T extends RichBlock["type"]>(blocks: RichBlock[], type: T) {
  return blocks.filter((b): b is Extract<RichBlock, { type: T }> => b.type === type);
}

describe("htmlToBlocks", () => {
  test("maps headings, paragraphs, and inline formatting", () => {
    const blocks = htmlToBlocks(
      `<div><h1>Title</h1><h3>Sub</h3><p>Plain <strong>bold</strong> and <em>italic</em> and <code>x()</code>.</p></div>`,
      BASE,
    );
    const headings = only(blocks, "heading");
    expect(headings.map((h) => h.level)).toEqual([2, 3]); // h1 clamps to 2
    const para = only(blocks, "paragraph")[0]!;
    expect(para.spans.some((s) => s.bold && s.text.includes("bold"))).toBe(true);
    expect(para.spans.some((s) => s.italic && s.text.includes("italic"))).toBe(true);
    expect(para.spans.some((s) => s.code && s.text.includes("x()"))).toBe(true);
  });

  test("keeps only safe absolute links and resolves relative ones", () => {
    const blocks = htmlToBlocks(
      `<p><a href="/next">rel</a> <a href="javascript:alert(1)">xss</a> <a href="http://localhost/x">ssrf</a></p>`,
      BASE,
    );
    const spans = only(blocks, "paragraph")[0]!.spans;
    expect(spans.find((s) => s.text === "rel")?.href).toBe("https://blog.example.com/next");
    expect(spans.find((s) => s.text === "xss")?.href).toBeUndefined();
    expect(spans.find((s) => s.text === "ssrf")?.href).toBeUndefined(); // localhost blocked
  });

  test("rewrites images through the proxy and drops unsafe ones", () => {
    const blocks = htmlToBlocks(
      `<p>before</p><figure><img src="/a.png" alt="Diagram"></figure><img src="http://127.0.0.1/secret.png">`,
      BASE,
    );
    const images = only(blocks, "image");
    expect(images).toHaveLength(1); // the loopback image is dropped
    expect(images[0]!.alt).toBe("Diagram");
    expect(images[0]!.src).toBe(proxiedImageUrl("https://blog.example.com/a.png"));
    expect(images[0]!.src.startsWith("/api/img?u=")).toBe(true);
  });

  test("parses lists, code blocks, and tables", () => {
    const blocks = htmlToBlocks(
      `<ul><li>one</li><li>two</li></ul>` +
        `<pre><code>const a = 1;\nconsole.log(a)</code></pre>` +
        `<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>`,
      BASE,
    );
    const list = only(blocks, "list")[0]!;
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(only(blocks, "code")[0]!.code).toContain("console.log(a)");
    const table = only(blocks, "table")[0]!;
    expect(table.header).toEqual(["H1", "H2"]);
    expect(table.rows).toEqual([["a", "b"]]);
  });

  test("never emits script/style/iframe content and never throws on garbage", () => {
    const blocks = htmlToBlocks(
      `<div><script>alert(1)</script><style>.x{}</style><iframe src="evil"></iframe><p>safe</p></div>`,
      BASE,
    );
    expect(only(blocks, "paragraph").map((p) => p.spans.map((s) => s.text).join(""))).toEqual(["safe"]);
    expect(htmlToBlocks("<<<not html", BASE)).toEqual([]);
  });
});
