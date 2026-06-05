// Structured schema for the cold_judge task. The LLM owns these as IMMUTABLE inputs
// (decision 6): five 0-100 dimensions plus generated display text. Output is validated
// against this schema and clamped; malformed output marks the post judge_failed,
// it is never silently defaulted. The StubLLMProvider fixture satisfies this schema.

import { z } from "zod";

const dimension = z.number().int().min(0).max(100);

// Reader-facing content classification (SP2 point 5). Mandatory, no fallback: the LLM must
// pick exactly one. Mirrors the content_type pgEnum — keep in sync if that enum changes.
export const CONTENT_TYPES = [
  "model_release",
  "product_release",
  "tech_share",
  "discussion",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const coldJudgeSchema = z.object({
  aiRelevance: dimension,
  impact: dimension,
  novelty: dimension,
  audienceUsefulness: dimension,
  evidenceClarity: dimension,
  title: z.string().min(1),
  summary: z.string().min(1),
  category: z.string().min(1),
  contentType: z.enum(CONTENT_TYPES),
  tags: z.array(z.string()),
  recommendationReason: z.string().min(1),
});

export type ColdJudge = z.infer<typeof coldJudgeSchema>;
