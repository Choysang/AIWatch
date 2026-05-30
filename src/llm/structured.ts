// Retry-once wrapper for structured LLM generation (Scoring Integrity slice / Phase C).
//
// Spec § 11 LLM Provider Abstraction: "Structured output enforced, validated, clamped,
// with one retry; malformed marks the post `judge_failed`, never silently defaulted."
//
// Lives one layer above the provider abstraction so every provider gets the same retry
// semantics for free. Provider errors (timeouts, 429s, transport) are NOT retried here —
// the route's own backoff handles those; this wrapper is specifically for "the model
// returned JSON that doesn't match the schema".
//
// Two error shapes:
//   - LlmProviderError: the network/transport/upstream failed (no schema validation
//     even attempted). Caller marks the post judge_failed with reason "provider_error".
//   - LlmSchemaError: the model returned, but the output failed Zod validation twice in a
//     row. Caller marks the post judge_failed with reason "schema_invalid".

import { z } from "zod";
import type { LLMProvider, StructuredGenerateInput, StructuredResult } from "./provider";

export class LlmProviderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class LlmSchemaError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly rawAttempts: number,
  ) {
    super(message);
  }
}

/** Wrap a structured-generate call with at-most-one retry on schema validation failure.
 *  The provider is asked to return parsed T; if it throws a ZodError, we retry exactly
 *  once with a stricter system reminder. Network / upstream errors bubble up unchanged. */
export async function structuredGenerateWithRetry<T>(
  provider: LLMProvider,
  input: StructuredGenerateInput<T>,
): Promise<StructuredResult<T>> {
  let lastZodError: z.ZodError | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages =
      attempt === 1
        ? input.messages
        : [
            ...input.messages,
            {
              role: "system" as const,
              content:
                "上一轮输出未通过 schema 校验。这次必须只返回严格符合 schema 的 JSON，不要附加解释或 Markdown。",
            },
          ];
    try {
      return await provider.structuredGenerate({ ...input, messages });
    } catch (err) {
      if (err instanceof z.ZodError) {
        lastZodError = err;
        continue;
      }
      // Transport / upstream / unknown → not a schema problem; surface immediately.
      throw new LlmProviderError(
        err instanceof Error ? err.message : "provider call failed",
        err,
      );
    }
  }

  throw new LlmSchemaError(
    "structured output failed schema validation twice",
    lastZodError?.issues ?? [],
    2,
  );
}
