import { describe, expect, test } from "bun:test";
import {
  buildAffinityProfile,
  computeOwnerBoost,
  sourceAffinitySuggestion,
  type AnnotatedEventDims,
  type OwnerBoostConfig,
} from "./owner-affinity";

const config: OwnerBoostConfig = {
  usefulBoost: 12,
  notUsefulPenalty: 20,
  affinityBoostMax: 6,
  minSamples: 3,
};

function ann(over: Partial<AnnotatedEventDims>): AnnotatedEventDims {
  return {
    verdict: "useful",
    sourceId: "src_a",
    category: "AI Coding",
    contentType: "howto",
    tags: [],
    ...over,
  };
}

describe("buildAffinityProfile", () => {
  test("affinity = (useful - not_useful) / n per dimension key", () => {
    const profile = buildAffinityProfile(
      [
        ann({ verdict: "useful" }),
        ann({ verdict: "useful" }),
        ann({ verdict: "useful" }),
        ann({ verdict: "not_useful" }),
      ],
      config.minSamples,
    );
    const src = profile.source.get("src_a");
    expect(src?.n).toBe(4);
    expect(src?.affinity).toBeCloseTo((3 - 1) / 4, 6);
  });

  test("below minSamples the affinity is 0 (insufficient evidence)", () => {
    const profile = buildAffinityProfile(
      [ann({ verdict: "useful" }), ann({ verdict: "useful" })],
      config.minSamples,
    );
    const src = profile.source.get("src_a");
    expect(src?.n).toBe(2);
    expect(src?.affinity).toBe(0);
  });

  test("null dims are skipped; tags tally per tag", () => {
    const profile = buildAffinityProfile(
      [
        ann({ sourceId: null, category: null, contentType: null, tags: ["claude", "codex"] }),
        ann({ sourceId: null, category: null, contentType: null, tags: ["claude"] }),
        ann({
          verdict: "not_useful",
          sourceId: null,
          category: null,
          contentType: null,
          tags: ["claude"],
        }),
      ],
      config.minSamples,
    );
    expect(profile.source.size).toBe(0);
    expect(profile.tag.get("claude")?.n).toBe(3);
    expect(profile.tag.get("claude")?.affinity).toBeCloseTo(1 / 3, 6);
    expect(profile.tag.get("codex")?.affinity).toBe(0); // n=1 < minSamples
  });
});

describe("computeOwnerBoost", () => {
  const profile = buildAffinityProfile(
    [
      ann({ verdict: "useful" }),
      ann({ verdict: "useful" }),
      ann({ verdict: "useful" }),
      ann({ verdict: "useful" }),
    ],
    config.minSamples,
  );

  test("direct useful verdict adds the configured boost", () => {
    const r = computeOwnerBoost(
      { directVerdict: "useful", sourceId: null, category: null, contentType: null },
      profile,
      config,
    );
    expect(r.directBoost).toBe(12);
    expect(r.affinityBoost).toBe(0);
    expect(r.ownerBoost).toBe(12);
  });

  test("direct not_useful verdict subtracts the penalty", () => {
    const r = computeOwnerBoost(
      { directVerdict: "not_useful", sourceId: null, category: null, contentType: null },
      profile,
      config,
    );
    expect(r.ownerBoost).toBe(-20);
  });

  test("affinity boost is affinityBoostMax * mean of the 3 dims, missing keys neutral", () => {
    // All 3 dims at affinity +1 -> mean 1 -> +6.
    const full = computeOwnerBoost(
      { directVerdict: null, sourceId: "src_a", category: "AI Coding", contentType: "howto" },
      profile,
      config,
    );
    expect(full.affinityBoost).toBeCloseTo(6, 6);

    // Only the source dim matches -> mean = (1 + 0 + 0) / 3 -> +2.
    const partial = computeOwnerBoost(
      { directVerdict: null, sourceId: "src_a", category: "其他", contentType: null },
      profile,
      config,
    );
    expect(partial.affinityBoost).toBeCloseTo(2, 6);
    expect(partial.ownerBoost).toBeCloseTo(2, 6);
  });

  test("tag affinity joins the owner boost when similar tags repeat", () => {
    const tagged = buildAffinityProfile(
      [
        ann({ verdict: "useful", sourceId: null, category: null, contentType: null, tags: ["agent"] }),
        ann({ verdict: "useful", sourceId: null, category: null, contentType: null, tags: ["agent"] }),
        ann({ verdict: "useful", sourceId: null, category: null, contentType: null, tags: ["agent"] }),
      ],
      config.minSamples,
    );
    const r = computeOwnerBoost(
      { directVerdict: null, sourceId: null, category: null, contentType: null, tags: ["agent"] },
      tagged,
      config,
    );
    expect(r.affinityBoost).toBeCloseTo(1.5, 6);
  });
  test("direct and affinity boosts compose additively", () => {
    const r = computeOwnerBoost(
      { directVerdict: "not_useful", sourceId: "src_a", category: "AI Coding", contentType: "howto" },
      profile,
      config,
    );
    expect(r.ownerBoost).toBeCloseTo(-20 + 6, 6);
  });
});

describe("sourceAffinitySuggestion", () => {
  test("needs n >= 5 and |affinity| >= 0.5", () => {
    expect(sourceAffinitySuggestion(undefined)).toBeNull();
    expect(sourceAffinitySuggestion({ useful: 2, notUseful: 2, n: 4, affinity: -1 })).toBeNull();
    expect(sourceAffinitySuggestion({ useful: 0, notUseful: 5, n: 5, affinity: -1 })).toBe("demote");
    expect(sourceAffinitySuggestion({ useful: 5, notUseful: 0, n: 5, affinity: 1 })).toBe("promote");
    expect(sourceAffinitySuggestion({ useful: 3, notUseful: 2, n: 5, affinity: 0.2 })).toBeNull();
  });
});
