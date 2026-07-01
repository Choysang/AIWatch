import { describe, expect, test } from "bun:test";
import { eventTextSimilarityForFold, isLikelySameEventText } from "./events";

describe("semantic event text folding", () => {
  test("matches cross-language rewrites of the same model/product event", () => {
    const left = "OpenAI releases GPT-5.6 Sol with new coding mode for developers";
    const right = "OpenAI 预览新一代模型 GPT-5.6 Sol，面向开发者加入新的 coding mode";

    const similarity = eventTextSimilarityForFold(left, right);

    expect(similarity.strongShared).toBeGreaterThanOrEqual(1);
    expect(similarity.score).toBeGreaterThanOrEqual(0.54);
    expect(isLikelySameEventText(left, right)).toBe(true);
  });

  test("does not merge different events from the same company", () => {
    const release = "OpenAI releases GPT-5.6 Sol with new coding mode for developers";
    const outage = "OpenAI API outage disrupts ChatGPT and developer dashboards";

    expect(isLikelySameEventText(release, outage)).toBe(false);
  });
});
