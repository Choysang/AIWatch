// Golden tests for the deterministic comment_quality_score aggregator.

import { describe, expect, test } from "bun:test";
import { computeCommentQualityScore, type ValidComment } from "./comment-quality";
import { scoringConfig } from "./config";

describe("computeCommentQualityScore", () => {
  test("cold (no comments) returns commentQualityNeutral", () => {
    const r = computeCommentQualityScore({ comments: [] });
    expect(r.commentQualityScore).toBe(scoringConfig.commentQualityNeutral);
    expect(r.breakdown.cold).toBe(true);
    expect(r.breakdown.validCount).toBe(0);
  });

  test("one unclassified non-expert comment is non-cold and above zero", () => {
    const comments: ValidComment[] = [{ category: "unclassified", isExpert: false }];
    const r = computeCommentQualityScore({ comments });
    expect(r.breakdown.cold).toBe(false);
    expect(r.commentQualityScore).toBeGreaterThan(0);
  });

  test("expert comments dominate over non-expert", () => {
    const expert = computeCommentQualityScore({
      comments: [{ category: "criticism", isExpert: true }],
    });
    const nonExpert = computeCommentQualityScore({
      comments: [{ category: "criticism", isExpert: false }],
    });
    expect(expert.commentQualityScore).toBeGreaterThan(nonExpert.commentQualityScore);
  });

  test("categorized comment outweighs unclassified of same author tier", () => {
    const tagged = computeCommentQualityScore({
      comments: [{ category: "handson", isExpert: false }],
    });
    const untagged = computeCommentQualityScore({
      comments: [{ category: "unclassified", isExpert: false }],
    });
    expect(tagged.commentQualityScore).toBeGreaterThan(untagged.commentQualityScore);
  });

  test("monotone in comment count and saturates near 100", () => {
    const make = (n: number): ValidComment[] =>
      Array.from({ length: n }, () => ({ category: "supplement" as const, isExpert: true }));
    const a = computeCommentQualityScore({ comments: make(1) }).commentQualityScore;
    const b = computeCommentQualityScore({ comments: make(5) }).commentQualityScore;
    const c = computeCommentQualityScore({ comments: make(50) }).commentQualityScore;
    expect(b).toBeGreaterThan(a);
    // Past the saturation knee both b and c can pin to 100 — that's correct behavior;
    // only require non-decreasing here.
    expect(c).toBeGreaterThanOrEqual(b);
    expect(c).toBeLessThanOrEqual(100);
  });

  test("each substantive category counts (praise/criticism/handson/supplement/controversy)", () => {
    const categories: ValidComment["category"][] = [
      "praise",
      "criticism",
      "handson",
      "supplement",
      "controversy",
    ];
    for (const category of categories) {
      const r = computeCommentQualityScore({ comments: [{ category, isExpert: false }] });
      const untagged = computeCommentQualityScore({
        comments: [{ category: "unclassified", isExpert: false }],
      });
      expect(r.commentQualityScore).toBeGreaterThan(untagged.commentQualityScore);
    }
  });

  test("breakdown reports expert + categorized counts", () => {
    const r = computeCommentQualityScore({
      comments: [
        { category: "praise", isExpert: true },
        { category: "praise", isExpert: false },
        { category: "unclassified", isExpert: true },
      ],
    });
    expect(r.breakdown.validCount).toBe(3);
    expect(r.breakdown.expertCount).toBe(2);
    expect(r.breakdown.categorizedCount).toBe(2);
  });
});
