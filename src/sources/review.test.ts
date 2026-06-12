import { describe, expect, test } from "bun:test";
import { decideSourceReview, type SourceReviewMetrics } from "./review";

const NOW = new Date("2026-05-26T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function metrics(overrides: Partial<SourceReviewMetrics> = {}): SourceReviewMetrics {
  return {
    createdAt: daysAgo(90),
    lastFetchAt: daysAgo(0),
    selectedContribution60d: 3,
    events30d: 40,
    selectedCount30d: 10,
    ...overrides,
  };
}

describe("decideSourceReview", () => {
  test("returns null for a young source even with no selections (don't judge early)", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(5), selectedContribution60d: 0, events30d: 50, selectedCount30d: 0 }),
        NOW,
      ),
    ).toBeNull();
  });

  test("suggests pause when an old, crawling source has zero selected contribution in 60d", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(70), selectedContribution60d: 0 }),
        NOW,
      ),
    ).toBe("no_contribution_60d");
  });

  test("does not suggest pause when the source has never crawled (breaker handles dead feeds)", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(70), lastFetchAt: null, selectedContribution60d: 0, events30d: 0, selectedCount30d: 0 }),
        NOW,
      ),
    ).toBeNull();
  });

  test("marks for review when the 30d selected rate is below threshold on a big-enough sample", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(70), selectedContribution60d: 2, events30d: 40, selectedCount30d: 1 }),
        NOW,
      ),
    ).toBe("low_selected_rate_30d");
  });

  test("does not mark for review on a small sample even at a 0% rate", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(70), selectedContribution60d: 1, events30d: 5, selectedCount30d: 0 }),
        NOW,
      ),
    ).toBeNull();
  });

  test("returns null for a healthy contributing source", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(70), selectedContribution60d: 5, events30d: 40, selectedCount30d: 10 }),
        NOW,
      ),
    ).toBeNull();
  });

  test("no-contribution takes precedence over low-rate when both could apply", () => {
    expect(
      decideSourceReview(
        metrics({ createdAt: daysAgo(70), selectedContribution60d: 0, events30d: 40, selectedCount30d: 0 }),
        NOW,
      ),
    ).toBe("no_contribution_60d");
  });
});
