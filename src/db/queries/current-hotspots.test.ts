import { describe, expect, test } from "bun:test";
import { rankCurrentHotspots, type HotspotCandidate } from "./current-hotspots";

const NOW = new Date("2026-06-11T08:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

function candidate(overrides: Partial<HotspotCandidate> & Pick<HotspotCandidate, "id" | "title">): HotspotCandidate {
  return {
    sourceCount: 1,
    officialSourceCount: 0,
    qualityScore: 70,
    selectedLevel: "none",
    publishedAt: hoursAgo(1),
    createdAt: hoursAgo(1),
    sources: [{ name: "Builder", type: "expert" }],
    ...overrides,
  };
}

describe("rankCurrentHotspots", () => {
  test("orders by independent source heat with official sources weighted above raw recency", () => {
    const ranked = rankCurrentHotspots(
      [
        candidate({
          id: "recent_single",
          title: "Fresh one-off post",
          sourceCount: 1,
          publishedAt: hoursAgo(0.5),
        }),
        candidate({
          id: "multi_official",
          title: "Model launch covered widely",
          sourceCount: 3,
          officialSourceCount: 1,
          selectedLevel: "A",
          qualityScore: 86,
          publishedAt: hoursAgo(3),
          sources: [
            { name: "OpenAI", type: "official" },
            { name: "Builder Weekly", type: "media" },
            { name: "Karpathy", type: "expert" },
          ],
        }),
        candidate({
          id: "multi_nonofficial",
          title: "Community benchmark discussion",
          sourceCount: 3,
          officialSourceCount: 0,
          qualityScore: 82,
          publishedAt: hoursAgo(2),
          sources: [
            { name: "Benchmarks", type: "community" },
            { name: "Model Blog", type: "media" },
            { name: "Researcher", type: "expert" },
          ],
        }),
      ],
      NOW,
    );

    expect(ranked.map((item) => item.id)).toEqual(["multi_official", "multi_nonofficial"]);
    expect(ranked[0]!.sourceNames).toEqual(["OpenAI", "Builder Weekly", "Karpathy"]);
  });

  test("hides quiet days and naturally decays old stories out of the block", () => {
    const ranked = rankCurrentHotspots(
      [
        candidate({
          id: "single",
          title: "Single source note",
          sourceCount: 1,
          publishedAt: hoursAgo(1),
        }),
        candidate({
          id: "old",
          title: "Old but once hot",
          sourceCount: 12,
          officialSourceCount: 2,
          selectedLevel: "S",
          qualityScore: 94,
          publishedAt: hoursAgo(96),
        }),
      ],
      NOW,
    );

    expect(ranked).toEqual([]);
  });

  test("promotes a fresh event once two independent sources report it", () => {
    const ranked = rankCurrentHotspots(
      [
        candidate({
          id: "two_source_event",
          title: "Official launch picked up by builders",
          sourceCount: 2,
          qualityScore: 72,
          publishedAt: hoursAgo(1),
          sources: [
            { name: "Company Blog", type: "official" },
            { name: "Builder Notes", type: "expert" },
          ],
        }),
      ],
      NOW,
    );

    expect(ranked.map((item) => item.id)).toEqual(["two_source_event"]);
    expect(ranked[0]!.sourceCount).toBe(2);
  });

  test("does not require an official source for a fresh two-source story", () => {
    const ranked = rankCurrentHotspots(
      [
        candidate({
          id: "two_independent_sources",
          title: "Builders converge on the same release",
          sourceCount: 2,
          officialSourceCount: 0,
          qualityScore: 60,
          publishedAt: hoursAgo(8),
          sources: [
            { name: "Builder Notes", type: "expert" },
            { name: "AI Engineer", type: "media" },
          ],
        }),
      ],
      NOW,
    );

    expect(ranked.map((item) => item.id)).toEqual(["two_independent_sources"]);
  });

  test("does not let repeated posts from the same account inflate heat", () => {
    const ranked = rankCurrentHotspots(
      [
        candidate({
          id: "duplicate_official",
          title: "One account repeats the same announcement",
          sourceCount: 3,
          officialSourceCount: 3,
          qualityScore: 92,
          selectedLevel: "S",
          publishedAt: hoursAgo(1),
          sources: [
            { name: "OpenAI", type: "official" },
            { name: "OpenAI", type: "official" },
            { name: "OpenAI", type: "official" },
          ],
        }),
      ],
      NOW,
    );

    expect(ranked).toEqual([]);
  });
});
