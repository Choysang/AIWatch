// Unit tests for the cold_judge schema. The SP2 addition is content_type: a mandatory enum
// with no fallback — a judgment that omits it or uses an unknown value must fail validation
// (the pipeline then marks the post judge_failed rather than guessing a category).

import { describe, expect, test } from "bun:test";
import { DEFAULT_JUDGMENT } from "@/llm/stub";
import { CONTENT_TYPES, coldJudgeSchema } from "./judge-schema";

const valid = {
  aiRelevance: 80,
  impact: 70,
  novelty: 60,
  audienceUsefulness: 65,
  evidenceClarity: 75,
  title: "中文标题",
  summary: "摘要",
  category: "模型",
  contentType: "model_release" as const,
  tags: ["a"],
  recommendationReason: "理由",
};

describe("coldJudgeSchema content_type", () => {
  test("accepts each of the four content types", () => {
    for (const ct of CONTENT_TYPES) {
      expect(coldJudgeSchema.parse({ ...valid, contentType: ct }).contentType).toBe(ct);
    }
  });

  test("rejects a missing content_type (no silent default)", () => {
    const { contentType: _omit, ...without } = valid;
    expect(() => coldJudgeSchema.parse(without)).toThrow();
  });

  test("rejects an unknown content_type", () => {
    expect(() => coldJudgeSchema.parse({ ...valid, contentType: "rumor" })).toThrow();
  });

  test("the stub fixture satisfies the schema (kept in sync)", () => {
    expect(() => coldJudgeSchema.parse(DEFAULT_JUDGMENT)).not.toThrow();
  });
});
