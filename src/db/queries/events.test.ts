import { describe, expect, test } from "bun:test";
import { shouldReplaceMainPost } from "./events";

describe("shouldReplaceMainPost", () => {
  test("keeps the earlier original as the main post even when a later repost scores higher", () => {
    const currentPublishedAt = new Date("2026-06-29T01:00:00Z");
    const nextPublishedAt = new Date("2026-06-29T03:00:00Z");

    expect(
      shouldReplaceMainPost({
        currentPipelineScore: 60,
        currentPublishedAt,
        nextPipelineScore: 95,
        nextPublishedAt,
      }),
    ).toBe(false);
  });

  test("replaces the main post when a newly merged post is earlier than the current one", () => {
    const currentPublishedAt = new Date("2026-06-29T03:00:00Z");
    const nextPublishedAt = new Date("2026-06-29T01:00:00Z");

    expect(
      shouldReplaceMainPost({
        currentPipelineScore: 95,
        currentPublishedAt,
        nextPipelineScore: 60,
        nextPublishedAt,
      }),
    ).toBe(true);
  });

  test("falls back to score only when publish times cannot pick an original", () => {
    expect(
      shouldReplaceMainPost({
        currentPipelineScore: 60,
        currentPublishedAt: null,
        nextPipelineScore: 95,
        nextPublishedAt: null,
      }),
    ).toBe(true);
  });
});
