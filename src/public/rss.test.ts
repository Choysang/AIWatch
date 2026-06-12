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
    source: { name: "OpenAI", handle: "openai", platform: "x" },
    ...overrides,
  };
}

describe("renderRssFeed", () => {
  test("emits a well-formed RSS 2.0 channel with items", () => {
    const xml = renderRssFeed([item()], { origin: "https://aiwatch.icu/" });
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("https://aiwatch.icu</link>"); // trailing slash trimmed
    expect(xml).toContain("<link>https://example.com/post</link>");
    expect(xml).toContain("Mon, 01 Jun 2026 00:00:00 GMT"); // published_at -> RFC822 pubDate
  });

  test("uses CDATA for title + description and a non-permalink guid", () => {
    const xml = renderRssFeed([item({ title: "A & B <tag>" })], { origin: "https://aiwatch.icu" });
    expect(xml).toContain("<![CDATA[A & B <tag>]]>");
    expect(xml).toContain('<guid isPermaLink="false">evt_1</guid>');
  });

  test("T1 (no detailed summary) falls back to the one-liner; never raw text", () => {
    const xml = renderRssFeed(
      [item({ tier: "T1", detailed_summary: null })],
      { origin: "https://aiwatch.icu" },
    );
    expect(xml).toContain("<![CDATA[一句话摘要]]>");
  });

  test("missing item url falls back to the on-site event link", () => {
    const xml = renderRssFeed([item({ url: null })], { origin: "https://aiwatch.icu" });
    expect(xml).toContain("<link>https://aiwatch.icu/events/evt_1</link>");
  });
});
