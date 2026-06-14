import { describe, expect, test } from "bun:test";
import { buildOpml, escapeXml } from "./build";

const NOW = new Date("2026-06-14T00:00:00Z");

describe("escapeXml", () => {
  test("escapes the five predefined entities, ampersand first", () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f",
    );
    // An already-escaped-looking string is double-escaped (raw text in, entities out).
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });
});

describe("buildOpml", () => {
  test("emits a valid OPML 2.0 skeleton with the title and date", () => {
    const xml = buildOpml({ title: "AIWatch 精选 RSS 信源", outlines: [] }, NOW);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain("<title>AIWatch 精选 RSS 信源</title>");
    expect(xml).toContain(`<dateCreated>${NOW.toUTCString()}</dateCreated>`);
    expect(xml).toContain("<body>");
    expect(xml.trimEnd().endsWith("</opml>")).toBe(true);
  });

  test("groups outlines by category and renders rss feed outlines", () => {
    const xml = buildOpml(
      {
        title: "T",
        outlines: [
          { text: "OpenAI Blog", xmlUrl: "https://openai.com/feed.xml", htmlUrl: "https://openai.com", category: "官方" },
          { text: "Simon Willison", xmlUrl: "https://simonwillison.net/atom", category: "专家" },
        ],
      },
      NOW,
    );
    expect(xml).toContain('<outline text="官方" title="官方">');
    expect(xml).toContain(
      '<outline type="rss" text="OpenAI Blog" title="OpenAI Blog" xmlUrl="https://openai.com/feed.xml" htmlUrl="https://openai.com" />',
    );
    // No htmlUrl => attribute omitted.
    expect(xml).toContain(
      '<outline type="rss" text="Simon Willison" title="Simon Willison" xmlUrl="https://simonwillison.net/atom" />',
    );
  });

  test("uncategorized outlines fall under the fallback folder", () => {
    const xml = buildOpml({ title: "T", outlines: [{ text: "X", xmlUrl: "https://x/feed" }] }, NOW);
    expect(xml).toContain('<outline text="未分类" title="未分类">');
  });

  test("escapes XML metacharacters in titles and urls", () => {
    const xml = buildOpml(
      { title: "T & U", outlines: [{ text: "A & B <C>", xmlUrl: "https://x/feed?a=1&b=2", category: "R&D" }] },
      NOW,
    );
    expect(xml).toContain("<title>T &amp; U</title>");
    expect(xml).toContain('text="A &amp; B &lt;C&gt;"');
    expect(xml).toContain('xmlUrl="https://x/feed?a=1&amp;b=2"');
    expect(xml).toContain('<outline text="R&amp;D" title="R&amp;D">');
  });
});
