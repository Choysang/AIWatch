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

export interface LLMProvider {
  readonly name: string;
  structuredGenerate<T>(input: StructuredGenerateInput<T>): Promise<T>;
}
