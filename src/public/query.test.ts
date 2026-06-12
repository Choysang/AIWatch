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
  test("defaults to selected mode + week window for the reader's low-noise feed", () => {
    const q = parse("");
    expect(q.mode).toBe("selected");
    expect(q.since).toBe("week");
    expect(q.take).toBe(DEFAULT_TAKE);
  });

  test("mode=latest and legacy mode=all default the window to all", () => {
    const latest = parse("mode=latest");
    expect(latest.mode).toBe("all");
    expect(latest.since).toBe("all");

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

  test("parses the per-source `sources` facet, dropping malformed ids", () => {
    expect(parse("sources=src_a,src_b").sourceIds).toEqual(["src_a", "src_b"]);
    // De-dupes, trims, and drops ids outside [a-z0-9_-]{1,64}.
    expect(parse("sources=src_a, src_a ,bad id,x'y").sourceIds).toEqual(["src_a"]);
    expect(parse("sources=").sourceIds).toBeUndefined();
    expect(parse("").sourceIds).toBeUndefined();
  });

  test("parses an optional minimum quality score", () => {
    expect(parse("minScore=80").minScore).toBe(80);
    expect(parse("minScore=0").minScore).toBe(0);
    expect(parse("minScore=100").minScore).toBe(100);
    expect(parse("minScore=").minScore).toBeUndefined();
    expect(parse("minScore=abc").minScore).toBeUndefined();
    expect(parse("minScore=-1").minScore).toBeUndefined();
    expect(parse("minScore=101").minScore).toBeUndefined();
  });

  test("accepts only canonical event domains and trims q", () => {
    const q = parse("category=product&q=%20gpt%20");
    expect(q.category).toBe("product");
    expect(q.q).toBe("gpt");
    expect(parse("category=%20模型%20").category).toBeUndefined();
    expect(parse("category=Core_Research").category).toBeUndefined(); // legacy value rejected
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

  test("parses comma-separated sourceTypes, accepting only valid enum values", () => {
    // Valid values come straight from the sources.source_type enum (decision 7 / spec §6).
    const q = parse("sourceTypes=official,kol,bogus,%20media%20");
    expect(q.sourceTypes).toEqual(["official", "kol", "media"]);
  });

  test("omits sourceTypes when empty or fully invalid", () => {
    expect(parse("").sourceTypes).toBeUndefined();
    expect(parse("sourceTypes=").sourceTypes).toBeUndefined();
    expect(parse("sourceTypes=bogus,nope").sourceTypes).toBeUndefined();
  });

  test("dedupes repeated sourceTypes", () => {
    expect(parse("sourceTypes=kol,kol,official").sourceTypes).toEqual(["kol", "official"]);
  });

  test("parses comma-separated sourceCategories, accepting only known taxonomy values", () => {
    const q = parse("sourceCategories=official,bogus,%20technical_share%20");
    expect(q.sourceCategories).toEqual(["official", "technical_share"]);
  });

  test("omits sourceCategories when empty or fully invalid", () => {
    expect(parse("").sourceCategories).toBeUndefined();
    expect(parse("sourceCategories=").sourceCategories).toBeUndefined();
    expect(parse("sourceCategories=bogus,nope").sourceCategories).toBeUndefined();
  });

  test("parses a custom date range; `to` is shifted to the exclusive next-day boundary", () => {
    const q = parse("from=2026-05-01&to=2026-05-31");
    expect(q.dateFrom?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    // 2026-05-31 fully included -> exclusive upper bound is the start of 2026-06-01.
    expect(q.dateTo?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  test("accepts an open-ended range (only from, or only to)", () => {
    expect(parse("from=2026-05-01").dateFrom?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(parse("from=2026-05-01").dateTo).toBeUndefined();
    expect(parse("to=2026-05-10").dateTo?.toISOString()).toBe("2026-05-11T00:00:00.000Z");
    expect(parse("to=2026-05-10").dateFrom).toBeUndefined();
  });

  test("drops malformed and impossible dates", () => {
    expect(parse("from=not-a-date").dateFrom).toBeUndefined();
    expect(parse("from=2026-13-01").dateFrom).toBeUndefined();
    expect(parse("to=2026-02-30").dateTo).toBeUndefined();
  });

  test("drops an inverted range (from on/after to)", () => {
    const q = parse("from=2026-05-31&to=2026-05-01");
    expect(q.dateFrom).toBeUndefined();
    expect(q.dateTo).toBeUndefined();
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
