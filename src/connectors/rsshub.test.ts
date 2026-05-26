import { describe, expect, test } from "bun:test";
import { RsshubConnector, rsshubUrl } from "./rsshub";
import type { ConnectorSource } from "./types";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Twitter @OpenAI</title>
    <item>
      <title>OpenAI 发布新模型</title>
      <link>https://twitter.com/OpenAI/status/1</link>
      <guid>1</guid>
      <description>新的大模型发布。</description>
      <pubDate>Mon, 26 May 2026 02:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

function source(overrides: Partial<ConnectorSource> = {}): ConnectorSource {
  return {
    id: "src_x_openai",
    platform: "x",
    connectorType: "rsshub",
    connectorRef: "/twitter/user/OpenAI",
    url: null,
    handle: "@OpenAI",
    ...overrides,
  };
}

describe("rsshubUrl", () => {
  test("joins base and route with exactly one slash", () => {
    expect(rsshubUrl("https://rsshub.app", "/twitter/user/OpenAI")).toBe(
      "https://rsshub.app/twitter/user/OpenAI",
    );
  });

  test("normalizes a trailing slash on the base and a missing leading slash on the route", () => {
    expect(rsshubUrl("https://rsshub.app/", "twitter/user/OpenAI")).toBe(
      "https://rsshub.app/twitter/user/OpenAI",
    );
  });

  test("passes an absolute connectorRef through unchanged", () => {
    expect(rsshubUrl("https://rsshub.app", "https://other.host/feed")).toBe(
      "https://other.host/feed",
    );
  });
});

describe("RsshubConnector", () => {
  test("fails closed with a clear message when no base URL is configured", async () => {
    const connector = new RsshubConnector({ baseUrl: "" });
    let message = "";
    try {
      await connector.fetch(source());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("RSSHUB_BASE_URL");
  });

  test("throws when the source has no route to fetch", async () => {
    const connector = new RsshubConnector({ baseUrl: "https://rsshub.app" });
    let message = "";
    try {
      await connector.fetch(source({ connectorRef: null, url: null }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("no connectorRef");
  });

  test("fetches the routed URL and parses the feed into RawPost[]", async () => {
    const calls: string[] = [];
    const connector = new RsshubConnector({
      baseUrl: "https://rsshub.app",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(FEED, { status: 200 });
      },
    });

    const posts = await connector.fetch(source());

    expect(calls).toEqual(["https://rsshub.app/twitter/user/OpenAI"]);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.rawTitle).toBe("OpenAI 发布新模型");
    expect(posts[0]!.url).toBe("https://twitter.com/OpenAI/status/1");
  });

  test("throws on a non-ok HTTP response (so the crawl breaker trips)", async () => {
    const connector = new RsshubConnector({
      baseUrl: "https://rsshub.app",
      fetchImpl: async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }),
    });
    let message = "";
    try {
      await connector.fetch(source());
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("503");
  });
});
