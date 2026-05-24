import { describe, expect, test } from "bun:test";
import { canonicalizeUrl, contentHash } from "./dedup";

describe("canonicalizeUrl", () => {
  test("strips tracking params and keeps real ones", () => {
    expect(canonicalizeUrl("https://openai.com/blog?utm_source=x&id=5")).toBe(
      "https://openai.com/blog?id=5",
    );
  });

  test("normalizes host casing, www, and hash", () => {
    expect(canonicalizeUrl("https://WWW.OpenAI.com/Blog#section")).toBe("https://openai.com/Blog");
  });

  test("returns the input unchanged on an invalid URL", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("contentHash", () => {
  test("is stable across surrounding whitespace", () => {
    expect(contentHash("  hello ")).toBe(contentHash("hello"));
  });

  test("differs for different content", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});
