import { describe, expect, test } from "bun:test";
import { deriveConnector, deriveConnectorRef, xProfileRouteFromUrl } from "./source-ref";

describe("xProfileRouteFromUrl", () => {
  test("turns an X profile URL into an RSSHub twitter user route", () => {
    expect(xProfileRouteFromUrl("https://x.com/OpenAI")).toBe("/twitter/user/OpenAI");
    expect(xProfileRouteFromUrl("https://twitter.com/ChatGPTapp/")).toBe(
      "/twitter/user/ChatGPTapp",
    );
  });

  test("ignores status URLs because those are individual posts, not monitorable profiles", () => {
    expect(xProfileRouteFromUrl("https://x.com/OpenAI/status/123")).toBeNull();
  });

  test("supports pasted handles", () => {
    expect(xProfileRouteFromUrl("@sama")).toBe("/twitter/user/sama");
  });
});

describe("deriveConnectorRef", () => {
  test("derives the RSSHub route from an X source homepage", () => {
    expect(
      deriveConnectorRef({
        platform: "x",
        connectorType: "rsshub",
        url: "https://x.com/OpenAI",
        handle: "",
        connectorRef: "",
      }),
    ).toBe("/twitter/user/OpenAI");
  });

  test("keeps an explicit connectorRef unchanged", () => {
    expect(
      deriveConnectorRef({
        platform: "x",
        connectorType: "rsshub",
        url: "https://x.com/OpenAI",
        handle: "@ignored",
        connectorRef: "/twitter/user/custom",
      }),
    ).toBe("/twitter/user/custom");
  });
});

describe("deriveConnector", () => {
  test("chooses RSSHub for an X homepage", () => {
    expect(
      deriveConnector({
        platform: "x",
        url: "https://x.com/OpenAI",
        handle: "",
      }),
    ).toEqual({ connectorType: "rsshub", connectorRef: "/twitter/user/OpenAI" });
  });

  test("chooses RSS for an RSS platform source", () => {
    expect(
      deriveConnector({
        platform: "rss",
        url: "https://example.com/feed.xml",
      }),
    ).toEqual({ connectorType: "rss", connectorRef: "https://example.com/feed.xml" });
  });

  test("falls back to manual when no automatic connector is known", () => {
    expect(
      deriveConnector({
        platform: "blog",
        url: "https://example.com",
      }),
    ).toEqual({ connectorType: "manual", connectorRef: null });
  });
});
