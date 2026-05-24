// Structured schema for the cold_judge task. The LLM owns these as IMMUTABLE inputs
// (decision 6): five 0-100 dimensions plus generated display text. Output is validated
// against this schema and clamped; malformed output marks the post judge_failed,
// it is never silently defaulted. The StubLLMProvider fixture satisfies this schema.

import { z } from "zod";

const dimension = z.number().int().min(0).max(100);

export const coldJudgeSchema = z.object({
  aiRelevance: dimension,
  impact: dimension,
  novelty: dimension,
  audienceUsefulness: dimension,
  evidenceClarity: dimension,
  summary: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()),
  recommendationReason: z.string().min(1),
});

export type ColdJudge = z.infer<typeof coldJudgeSchema>;
