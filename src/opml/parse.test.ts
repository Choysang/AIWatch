import { describe, expect, test } from "bun:test";
import { MAX_IMPORT_FEEDS, parseOpml } from "./parse";

describe("parseOpml", () => {
  test("extracts feed outlines with title, xmlUrl, and optional htmlUrl", () => {
    const xml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline text="官方" title="官方">
    <outline type="rss" text="OpenAI" title="OpenAI" xmlUrl="https://openai.com/feed.xml" htmlUrl="https://openai.com" />
  </outline>
  <outline type="rss" text="Simon" xmlUrl="https://simonwillison.net/atom" />
</body></opml>`;
    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual({ title: "OpenAI", xmlUrl: "https://openai.com/feed.xml", htmlUrl: "https://openai.com" });
    expect(feeds[1]).toEqual({ title: "Simon", xmlUrl: "https://simonwillison.net/atom", htmlUrl: null });
  });

  test("ignores folder outlines (no xmlUrl) and de-dupes by xmlUrl", () => {
    const xml = `<opml><body>
      <outline text="Folder" />
      <outline type="rss" text="A" xmlUrl="https://a.example/feed" />
      <outline type="rss" text="A dup" xmlUrl="https://a.example/feed" />
    </body></opml>`;
    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]?.xmlUrl).toBe("https://a.example/feed");
  });

  test("skips non-http(s) xmlUrl values", () => {
    const xml = `<opml><body>
      <outline type="rss" text="bad" xmlUrl="javascript:alert(1)" />
      <outline type="rss" text="ftp" xmlUrl="ftp://x/feed" />
      <outline type="rss" text="ok" xmlUrl="https://ok.example/feed" />
    </body></opml>`;
    const feeds = parseOpml(xml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]?.xmlUrl).toBe("https://ok.example/feed");
  });

  test("unescapes XML entities in titles and urls", () => {
    const xml = `<opml><body>
      <outline type="rss" text="A &amp; B &lt;C&gt;" xmlUrl="https://x/feed?a=1&amp;b=2" />
    </body></opml>`;
    const feeds = parseOpml(xml);
    expect(feeds[0]?.title).toBe("A & B <C>");
    expect(feeds[0]?.xmlUrl).toBe("https://x/feed?a=1&b=2");
  });

  test("falls back to the feed url when no title attribute is present", () => {
    const xml = `<opml><body><outline type="rss" xmlUrl="https://x.example/feed" /></body></opml>`;
    expect(parseOpml(xml)[0]?.title).toBe("https://x.example/feed");
  });

  test("caps the number of imported feeds", () => {
    const outlines = Array.from(
      { length: MAX_IMPORT_FEEDS + 10 },
      (_, i) => `<outline type="rss" text="f${i}" xmlUrl="https://x.example/feed${i}" />`,
    ).join("");
    const feeds = parseOpml(`<opml><body>${outlines}</body></opml>`);
    expect(feeds).toHaveLength(MAX_IMPORT_FEEDS);
  });
});
