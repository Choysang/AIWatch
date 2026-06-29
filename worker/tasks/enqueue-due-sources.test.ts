import { describe, expect, test } from "bun:test";
import { CRAWL_SOURCE_MAX_ATTEMPTS, crawlSourceJobKey } from "./enqueue-due-sources";

describe("enqueue-due-sources scheduling policy", () => {
  test("uses one stable crawl job key per source", () => {
    expect(crawlSourceJobKey("src_openai")).toBe("crawl-source:src_openai");
    expect(crawlSourceJobKey("src_openai")).toBe(crawlSourceJobKey("src_openai"));
  });

  test("keeps crawl retries short so slow sources cannot dominate the queue", () => {
    expect(CRAWL_SOURCE_MAX_ATTEMPTS).toBe(3);
  });
});
