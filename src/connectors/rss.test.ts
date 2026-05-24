import { describe, expect, test } from "bun:test";
import { parseFeed } from "./rss";

const RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example AI Blog</title>
    <item>
      <title>New LLM released</title>
      <link>https://example.com/a?utm_source=rss</link>
      <guid>https://example.com/a</guid>
      <description>A new large model with better inference.</description>
      <pubDate>Fri, 23 May 2026 02:00:00 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
    </item>
    <item>
      <title>Second item</title>
      <link>https://example.com/b</link>
      <description>Another update.</description>
      <pubDate>Fri, 23 May 2026 03:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom AI</title>
  <entry>
    <title>Atom entry one</title>
    <link href="https://atom.example.com/1"/>
    <id>urn:uuid:1</id>
    <updated>2026-05-23T04:00:00Z</updated>
    <summary>Atom summary about agents.</summary>
    <author><name>Atom Author</name></author>
  </entry>
</feed>`;

describe("parseFeed", () => {
  test("parses RSS 2.0 items", () => {
    const posts = parseFeed(RSS_2_0);
    expect(posts).toHaveLength(2);
    const first = posts[0]!;
    expect(first.rawTitle).toBe("New LLM released");
    expect(first.url).toBe("https://example.com/a?utm_source=rss");
    expect(first.authorName).toBe("Jane Doe");
    expect(first.publishedAt).toBeInstanceOf(Date);
  });

  test("parses Atom entries", () => {
    const posts = parseFeed(ATOM);
    expect(posts).toHaveLength(1);
    const entry = posts[0]!;
    expect(entry.rawTitle).toBe("Atom entry one");
    expect(entry.url).toBe("https://atom.example.com/1");
    expect(entry.authorName).toBe("Atom Author");
    expect(entry.externalId).toBe("urn:uuid:1");
  });

  test("returns an empty array for an empty channel", () => {
    const posts = parseFeed(`<rss version="2.0"><channel><title>x</title></channel></rss>`);
    expect(posts).toEqual([]);
  });
});
