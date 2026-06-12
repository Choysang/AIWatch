import { describe, expect, test } from "bun:test";
import { deterministicGate } from "@/core/gate";
import { MockConnector } from "./mock";
import type { ConnectorSource } from "./types";

const source: ConnectorSource = {
  id: "src_test",
  platform: "rss",
  connectorType: "mock",
  connectorRef: null,
  url: "https://example.com/feed",
  handle: null,
};

describe("MockConnector", () => {
  test("returns deterministic sample posts", async () => {
    const a = await new MockConnector().fetch(source);
    const b = await new MockConnector().fetch(source);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a).toEqual(b);
  });

  test("builds urls under the source url", async () => {
    const posts = await new MockConnector().fetch(source);
    for (const p of posts) {
      expect(p.url).toStartWith("https://example.com/");
    }
  });

  test("every sample post passes the $0 AI gate", async () => {
    const posts = await new MockConnector().fetch(source);
    for (const p of posts) {
      const result = deterministicGate({ title: p.rawTitle, content: p.rawContent });
      expect(result.pass).toBe(true);
    }
  });
});
