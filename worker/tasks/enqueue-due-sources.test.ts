import { describe, expect, test } from "bun:test";
import {
  CRAWL_SOURCE_MAX_ATTEMPTS,
  DEFAULT_RSSHUB_X_ENQUEUE_LIMIT,
  DEFAULT_RSSHUB_X_STAGGER_MS,
  crawlSourceJobKey,
  crawlSourceRunAt,
  isRsshubXSource,
  selectDueSourcesForEnqueue,
} from "./enqueue-due-sources";

describe("enqueue-due-sources scheduling policy", () => {
  test("uses one stable crawl job key per source", () => {
    expect(crawlSourceJobKey("src_openai")).toBe("crawl-source:src_openai");
    expect(crawlSourceJobKey("src_openai")).toBe(crawlSourceJobKey("src_openai"));
  });

  test("keeps crawl retries short so slow sources cannot dominate the queue", () => {
    expect(CRAWL_SOURCE_MAX_ATTEMPTS).toBe(3);
  });

  test("caps RSSHub X sources per enqueue batch so one token cannot be stampede-tested", () => {
    const due = [
      { id: "x1", platform: "x", connectorType: "rsshub" },
      { id: "x2", platform: "x", connectorType: "rsshub" },
      { id: "x3", platform: "x", connectorType: "rsshub" },
      { id: "rss1", platform: "rss", connectorType: "rss" },
      { id: "blog1", platform: "blog", connectorType: "rss" },
    ] as const;

    expect(isRsshubXSource(due[0])).toBe(true);
    expect(isRsshubXSource(due[3])).toBe(false);
    expect(selectDueSourcesForEnqueue(due, { limit: 5, rsshubXLimit: 2 }).map((s) => s.id)).toEqual([
      "x1",
      "x2",
      "rss1",
      "blog1",
    ]);
    expect(DEFAULT_RSSHUB_X_ENQUEUE_LIMIT).toBe(2);
  });

  test("staggers RSSHub X jobs while leaving other sources immediate", () => {
    const now = Date.UTC(2026, 5, 30, 10, 0, 0);
    const xSource = { id: "x1", platform: "x", connectorType: "rsshub" } as const;
    const rssSource = { id: "rss1", platform: "rss", connectorType: "rss" } as const;

    expect(crawlSourceRunAt(rssSource, 0, now)).toBeUndefined();
    expect(crawlSourceRunAt(xSource, 0, now)?.getTime()).toBe(now);
    expect(crawlSourceRunAt(xSource, 1, now)?.getTime()).toBe(now + DEFAULT_RSSHUB_X_STAGGER_MS);
  });
});
