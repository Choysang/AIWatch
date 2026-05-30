// Provider abstraction (locked decision). One interface; per-task routing picks the
// concrete provider. structuredGenerate enforces a schema so outputs are validated.

import type { z } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StructuredGenerateInput<T> {
  model: string;
  schema: z.ZodType<T>;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

/** Token usage for one provider call. Feeds spend_guard's ledger (src/llm/pricing.ts).
 *  Providers that can't report usage (or the offline stub) return zeros — costForUsage
 *  on a zero-usage call is $0, so it never trips a budget. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** A validated structured result plus the usage it consumed. Returning usage (rather than
 *  discarding it) is what lets the call path write the spend ledger without a side channel. */
export interface StructuredResult<T> {
  value: T;
  usage: TokenUsage;
}

export interface LLMProvider {
  readonly name: string;
  structuredGenerate<T>(input: StructuredGenerateInput<T>): Promise<StructuredResult<T>>;
}
