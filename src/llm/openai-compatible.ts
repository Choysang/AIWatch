// OpenAI-compatible chat-completions provider (Scoring Integrity slice / Phase C).
//
// Covers any vendor exposing the OpenAI Chat Completions API surface:
//   - OpenAI (api.openai.com)
//   - DeepSeek (api.deepseek.com)
//   - Qwen / DashScope (compatible mode)
//   - SiliconFlow, OpenRouter, vLLM, LM Studio, Ollama
//
// Structured-output strategy: response_format { type: "json_object" } if json-mode is the
// best the vendor supports, plus a system reminder embedding the Zod schema's JSON shape.
// The retry-once wrapper (structured.ts) handles validation drift.
//
// Network calls go through the `fetch` injection so tests can mock without nock/msw and
// the provider stays runtime-agnostic (Node, Bun, edge).

import { z } from "zod";
import type { LLMProvider, StructuredGenerateInput } from "./provider";

export interface OpenAICompatibleConfig {
  /** Human label stamped on event_judgments.provider. */
  name: string;
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string;
  /** Optional default headers (e.g. Authorization beta flags). */
  headers?: Record<string, string>;
  /** Inject a fetch implementation for tests / non-global-fetch runtimes. */
  fetch?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

const STRICT_JSON_REMINDER =
  "你必须只输出一个 JSON 对象，严格符合用户提示中的 schema。不要包裹在 markdown 代码块里，不要加任何解释或前言。";

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleConfig) {
    if (!config.apiKey) {
      throw new Error(`[${config.name}] missing apiKey — provider must fail closed`);
    }
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.headers = config.headers ?? {};
    this.fetchImpl = config.fetch ?? fetch;
  }

  async structuredGenerate<T>(input: StructuredGenerateInput<T>): Promise<T> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: input.model,
      temperature: input.temperature ?? 0,
      max_tokens: input.maxOutputTokens,
      response_format: { type: "json_object" as const },
      messages: [
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "system" as const, content: STRICT_JSON_REMINDER },
      ],
    };

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...this.headers,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new Error(
        `[${this.name}] HTTP ${res.status} from ${url}${detail ? `: ${detail}` : ""}`,
      );
    }

    const payload = (await res.json()) as ChatCompletionResponse;
    if (payload.error) {
      throw new Error(`[${this.name}] upstream error: ${payload.error.message ?? "unknown"}`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`[${this.name}] empty model response`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(content));
    } catch {
      // Surface as a ZodError so the retry wrapper treats it as a schema-validation
      // failure (which is what it is — the model didn't honor JSON mode).
      throw new z.ZodError([
        { code: "custom", message: "model output was not valid JSON", path: [] },
      ]);
    }
    return input.schema.parse(parsed);
  }
}

async function safeReadError(res: Response): Promise<string | null> {
  try {
    const txt = await res.text();
    return txt.slice(0, 500);
  } catch {
    return null;
  }
}

/** Some vendors still wrap output in ```json fences even with json mode requested. */
function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
