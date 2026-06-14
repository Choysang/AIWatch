import { describe, expect, test } from "bun:test";
import {
  buildReaderAffinityProfile,
  computeReaderBoost,
  readerAffinityConfig,
  type ReaderEventDims,
  type ReaderSignal,
  type ReaderSignalKind,
} from "./reader-affinity";

function sig(signal: ReaderSignalKind, partial: Partial<ReaderSignal> = {}): ReaderSignal {
  return {
    signal,
    tags: partial.tags ?? [],
    sourceId: partial.sourceId ?? null,
    category: partial.category ?? null,
    contentType: partial.contentType ?? null,
  };
}

function dims(partial: Partial<ReaderEventDims>): ReaderEventDims {
  return {
    tags: partial.tags ?? [],
    sourceId: partial.sourceId ?? null,
    category: partial.category ?? null,
    contentType: partial.contentType ?? null,
  };
}

const MAX = readerAffinityConfig.affinityBoostMax;

describe("buildReaderAffinityProfile", () => {
  test("weights star > like > view and makes down negative", () => {
    const profile = buildReaderAffinityProfile([
      sig("star", { tags: ["a"] }),
      sig("like", { tags: ["b"] }),
      sig("view", { tags: ["c"] }),
      sig("down", { tags: ["d"] }),
    ]);
    const a = profile.tag.get("a")?.affinity ?? 0;
    const b = profile.tag.get("b")?.affinity ?? 0;
    const c = profile.tag.get("c")?.affinity ?? 0;
    const d = profile.tag.get("d")?.affinity ?? 0;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0);
    expect(d).toBeLessThan(0);
  });

  test("accumulates across signals and aggregates every dimension", () => {
    const profile = buildReaderAffinityProfile([
      sig("star", { tags: ["ml"], sourceId: "src_x", category: "research", contentType: "release" }),
      sig("like", { tags: ["ml"], category: "research" }),
    ]);
    expect(profile.tag.get("ml")?.n).toBe(2);
    expect(profile.tag.get("ml")?.score).toBe(5); // star 3 + like 2
    expect(profile.source.get("src_x")?.affinity).toBeGreaterThan(0);
    expect(profile.category.get("research")?.affinity).toBeGreaterThan(0);
    expect(profile.contentType.get("release")?.affinity).toBeGreaterThan(0);
  });

  test("clamps affinity into [-1, 1] under strong repeated signals", () => {
    const many = Array.from({ length: 20 }, () => sig("star", { tags: ["x"] }));
    const profile = buildReaderAffinityProfile(many);
    expect(profile.tag.get("x")?.affinity).toBe(1);
  });

  test("an empty signal list is a cold-start profile", () => {
    const profile = buildReaderAffinityProfile([]);
    expect(profile.isEmpty).toBe(true);
    expect(profile.tag.size).toBe(0);
  });
});

describe("computeReaderBoost", () => {
  const profile = buildReaderAffinityProfile([
    sig("star", { tags: ["ml"] }),
    sig("down", { tags: ["crypto"] }),
  ]);

  test("boosts events matching a liked tag and penalizes a downed tag", () => {
    expect(computeReaderBoost(dims({ tags: ["ml"] }), profile)).toBeGreaterThan(0);
    expect(computeReaderBoost(dims({ tags: ["crypto"] }), profile)).toBeLessThan(0);
  });

  test("returns 0 when no dimension matches any signal", () => {
    expect(computeReaderBoost(dims({ tags: ["unrelated"], category: "news" }), profile)).toBe(0);
  });

  test("averages only matched dimensions, so one strong tag is not diluted", () => {
    // category "news" has no signal -> excluded; boost driven by the liked tag alone.
    const boost = computeReaderBoost(dims({ tags: ["ml"], category: "news" }), profile);
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(MAX);
  });

  test("never exceeds the configured bound", () => {
    const strong = buildReaderAffinityProfile(Array.from({ length: 20 }, () => sig("star", { tags: ["ml"] })));
    expect(computeReaderBoost(dims({ tags: ["ml"] }), strong)).toBe(MAX);
  });
});
