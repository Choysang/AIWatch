import { describe, expect, test } from "bun:test";
import {
  manualPostInputSchema,
  parsePublishedAt,
  toRawPost,
} from "./manual-post";

describe("manualPostInputSchema", () => {
  test("accepts a minimal valid entry (url + content)", () => {
    const parsed = manualPostInputSchema.parse({
      url: "https://x.com/ChatGPTapp/status/123",
      content: "新功能上线",
    });
    expect(parsed.url).toBe("https://x.com/ChatGPTapp/status/123");
    expect(parsed.content).toBe("新功能上线");
    expect(parsed.title).toBeUndefined();
  });

  test("rejects an invalid url", () => {
    const result = manualPostInputSchema.safeParse({ url: "not-a-url", content: "x" });
    expect(result.success).toBe(false);
  });

  test("rejects empty content", () => {
    const result = manualPostInputSchema.safeParse({
      url: "https://x.com/a/status/1",
      content: "   ",
    });
    expect(result.success).toBe(false);
  });

  test("trims content and coerces blank optionals to undefined", () => {
    const parsed = manualPostInputSchema.parse({
      url: "https://x.com/a/status/1",
      content: "  实测可用  ",
      title: "   ",
      authorName: "",
      imageUrl: "",
      publishedAt: "",
    });
    expect(parsed.content).toBe("实测可用");
    expect(parsed.title).toBeUndefined();
    expect(parsed.authorName).toBeUndefined();
    expect(parsed.imageUrl).toBeUndefined();
    expect(parsed.publishedAt).toBeUndefined();
  });

  test("rejects a non-url image", () => {
    const result = manualPostInputSchema.safeParse({
      url: "https://x.com/a/status/1",
      content: "x",
      imageUrl: "data:image/png;base64,AAAA",
    });
    expect(result.success).toBe(false);
  });
});

describe("parsePublishedAt", () => {
  test("returns null for undefined", () => {
    expect(parsePublishedAt(undefined)).toBeNull();
  });

  test("parses a datetime-local string", () => {
    const d = parsePublishedAt("2026-05-31T14:30");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d!.getTime())).toBe(false);
  });

  test("returns null for an unparseable string", () => {
    expect(parsePublishedAt("not-a-date")).toBeNull();
  });
});

describe("toRawPost", () => {
  test("maps fields and wraps image as { url } media", () => {
    const raw = toRawPost(
      manualPostInputSchema.parse({
        url: "https://x.com/ChatGPTapp/status/123",
        content: "正文",
        title: "标题",
        authorName: "OpenAI",
        authorHandle: "@ChatGPTapp",
        imageUrl: "https://pbs.twimg.com/media/x.jpg",
        publishedAt: "2026-05-31T14:30",
      }),
    );
    expect(raw.url).toBe("https://x.com/ChatGPTapp/status/123");
    expect(raw.rawTitle).toBe("标题");
    expect(raw.rawContent).toBe("正文");
    expect(raw.authorHandle).toBe("@ChatGPTapp");
    expect(raw.media).toEqual({ url: "https://pbs.twimg.com/media/x.jpg" });
    expect(raw.publishedAt).toBeInstanceOf(Date);
  });

  test("absent image -> null media; absent date -> null publishedAt", () => {
    const raw = toRawPost(
      manualPostInputSchema.parse({ url: "https://x.com/a/status/1", content: "正文" }),
    );
    expect(raw.media).toBeNull();
    expect(raw.publishedAt).toBeNull();
    expect(raw.rawTitle).toBeNull();
  });
});
