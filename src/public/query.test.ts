import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TAKE,
  MAX_TAGS,
  MAX_TAKE,
  decodeCursor,
  encodeCursor,
  parsePublicQuery,
  windowStart,
} from "./query";

const parse = (qs: string) => parsePublicQuery(new URLSearchParams(qs));

describe("parsePublicQuery", () => {
  test("defaults to selected mode + week window", () => {
    const q = parse("");
    expect(q.mode).toBe("selected");
    expect(q.since).toBe("week");
    expect(q.take).toBe(DEFAULT_TAKE);
  });

  test("mode=all defaults the window to all", () => {
    const q = parse("mode=all");
    expect(q.mode).toBe("all");
    expect(q.since).toBe("all");
  });

  test("clamps take to [1, MAX_TAKE] with a sane fallback", () => {
    expect(parse("take=9999").take).toBe(MAX_TAKE);
    expect(parse("take=-3").take).toBe(DEFAULT_TAKE);
    expect(parse("take=abc").take).toBe(DEFAULT_TAKE);
    expect(parse("take=10").take).toBe(10);
  });

  test("accepts valid level and ignores invalid", () => {
    expect(parse("level=S").level).toBe("S");
    expect(parse("level=Z").level).toBeUndefined();
  });

  test("trims category and q", () => {
    const q = parse("category=%20模型%20&q=%20gpt%20");
    expect(q.category).toBe("模型");
    expect(q.q).toBe("gpt");
  });

  test("parses comma-separated tags, trimming and dropping blanks", () => {
    const q = parse("tags=%20模型%20,,开源,");
    expect(q.tags).toEqual(["模型", "开源"]);
  });

  test("dedupes repeated tags and caps the count", () => {
    expect(parse("tags=a,a,b").tags).toEqual(["a", "b"]);
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`).join(",");
    expect(parse(`tags=${many}`).tags).toHaveLength(MAX_TAGS);
  });

  test("omits tags when empty or whitespace-only", () => {
    expect(parse("").tags).toBeUndefined();
    expect(parse("tags=%20").tags).toBeUndefined();
    expect(parse("tags=,,").tags).toBeUndefined();
  });
});

describe("cursor codec", () => {
  test("round-trips", () => {
    const c = { t: "2026-05-24T00:00:00.000Z", id: "evt_1" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  test("rejects malformed cursors", () => {
    expect(decodeCursor(null)).toBeUndefined();
    expect(decodeCursor("not-base64-json")).toBeUndefined();
    expect(decodeCursor(Buffer.from('{"t":"bad","id":"x"}').toString("base64url"))).toBeUndefined();
  });
});

describe("windowStart", () => {
  const now = new Date("2026-05-24T12:00:00Z");
  test("computes rolling windows and null for all", () => {
    expect(windowStart("all", now)).toBeNull();
    expect(windowStart("today", now)!.toISOString()).toBe("2026-05-23T12:00:00.000Z");
    expect(windowStart("week", now)!.toISOString()).toBe("2026-05-17T12:00:00.000Z");
    expect(windowStart("month", now)!.toISOString()).toBe("2026-04-24T12:00:00.000Z");
  });
});
