import { describe, expect, test } from "bun:test";
import type { BriefItem } from "@/db/queries/brief";
import { renderRssFeed } from "./rss";

function item(overrides: Partial<BriefItem> = {}): BriefItem {
  return {
    id: "evt_1",
    title: "OpenAI 发布新模型",
    category: "product",
    tier: "T2",
    score: 88,
    one_line_summary: "一句话摘要",
    detailed_summary: "详细摘要：发生了什么以及对开发者的影响。",
    core_viewpoints: [],
    tools: [],
    people: [],
    tags: [],
    source_count: 1,
    published_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    url: "https://example.com/post",
    body: "完整正文第一段。\n\n完整正文第二段。",
    full_text: "完整正文第一段。\n\n完整正文第二段。",
    full_blocks: [],
    media: { type: "image", url: "https://example.com/cover.png" },
    source: { name: "OpenAI", handle: "openai", platform: "x" },
    ...overrides,
  };
}

describe("renderRssFeed", () => {
  test("emits a well-formed RSS 2.0 channel with items", () => {
    const xml = renderRssFeed([item()], { origin: "https://aiwatch.icu/" });
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("https://aiwatch.icu</link>"); // trailing slash trimmed
    expect(xml).toContain("<link>https://aiwatch.icu/events/evt_1</link>");
    expect(xml).toContain("<source url=\"https://example.com/post\">OpenAI</source>");
    expect(xml).toContain("Mon, 01 Jun 2026 00:00:00 GMT"); // published_at -> RFC822 pubDate
  });

  test("uses CDATA for title, description, full content and a non-permalink guid", () => {
    const xml = renderRssFeed([item({ title: "A & B <tag>" })], { origin: "https://aiwatch.icu" });
    expect(xml).toContain("<![CDATA[A & B <tag>]]>");
    expect(xml).toContain("<content:encoded><![CDATA[");
    expect(xml).toContain("<p>完整正文第一段。</p>");
    expect(xml).toContain("<img src=\"https://aiwatch.icu/api/img?u=https%3A%2F%2Fexample.com%2Fcover.png\"");
    expect(xml).toContain('<guid isPermaLink="false">evt_1</guid>');
  });

  test("T1 (no detailed summary) falls back to the one-liner; never raw text", () => {
    const xml = renderRssFeed(
      [item({ tier: "T1", detailed_summary: null })],
      { origin: "https://aiwatch.icu" },
    );
    expect(xml).toContain("<![CDATA[一句话摘要]]>");
  });

  test("RSS item link always stays on the in-site event detail page", () => {
    const xml = renderRssFeed([item({ url: null })], { origin: "https://aiwatch.icu" });
    expect(xml).toContain("<link>https://aiwatch.icu/events/evt_1</link>");
  });
});
