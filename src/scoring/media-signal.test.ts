import { describe, expect, test } from "bun:test";
import { hasTextAndMedia } from "./media-signal";

describe("hasTextAndMedia", () => {
  test("requires both readable text and a visible media url", () => {
    expect(
      hasTextAndMedia({
        title: "OpenAI 发布新模型演示",
        media: { type: "image", url: "https://example.com/demo.png" },
      }),
    ).toBe(true);

    expect(hasTextAndMedia({ title: "OpenAI 发布新模型演示", media: null })).toBe(false);
    expect(hasTextAndMedia({ title: "短", media: "https://example.com/demo.png" })).toBe(false);
  });
});
