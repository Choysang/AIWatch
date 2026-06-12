import { describe, expect, test } from "bun:test";
import { normalizePost } from "./normalize";

describe("normalizePost", () => {
  test("uses the original title when present", () => {
    const n = normalizePost({ rawTitle: "OpenAI 发布新模型", rawContent: "正文内容" });
    expect(n.displayTitle).toBe("OpenAI 发布新模型");
    expect(n.titleSource).toBe("original");
  });

  test("falls back to the first sentence for title-less posts", () => {
    const n = normalizePost({
      rawContent: "这是第一句话。这是第二句话，不应出现在标题里。",
    });
    expect(n.displayTitle).toBe("这是第一句话");
    expect(n.titleSource).toBe("first_sentence");
  });

  test("truncates an overlong title-less first sentence", () => {
    const long = "a".repeat(200);
    const n = normalizePost({ rawContent: long });
    expect(n.displayTitle!.length).toBeLessThanOrEqual(120);
    expect(n.displayTitle!).toEndWith("...");
  });

  test("leaves displayTitle null when there is no title or content", () => {
    const n = normalizePost({ url: "https://x.com/a" });
    expect(n.displayTitle).toBeNull();
    expect(n.titleSource).toBeNull();
  });

  test("canonicalizes the url and strips tracking params", () => {
    const n = normalizePost({ rawTitle: "t", url: "https://www.Example.com/a?utm_source=x&id=1#frag" });
    expect(n.canonicalUrl).toBe("https://example.com/a?id=1");
  });

  test("content hash is stable and identical for identical content", () => {
    const a = normalizePost({ rawTitle: "t", rawContent: "c" });
    const b = normalizePost({ rawTitle: "t", rawContent: "c", url: "https://other.com" });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toHaveLength(64);
  });
});
