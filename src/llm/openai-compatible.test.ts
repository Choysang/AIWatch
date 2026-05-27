// Unit tests for the OpenAI-compatible provider — uses a fake fetch.

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { OpenAICompatibleProvider } from "./openai-compatible";

const schema = z.object({ score: z.number().int(), tag: z.string() });

function fakeFetch(reply: { ok?: boolean; status?: number; body: unknown }): typeof fetch {
  return (async () => {
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: async () => reply.body,
      text: async () => JSON.stringify(reply.body),
    } as Response;
  }) as unknown as typeof fetch;
}

const baseConfig = {
  name: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
};

describe("OpenAICompatibleProvider", () => {
  test("throws at construction time if apiKey is missing (fail closed)", () => {
    expect(() => new OpenAICompatibleProvider({ ...baseConfig, apiKey: "" })).toThrow();
  });

  test("parses chat-completion JSON content into the supplied schema", async () => {
    const provider = new OpenAICompatibleProvider({
      ...baseConfig,
      fetch: fakeFetch({
        body: {
          choices: [{ message: { content: JSON.stringify({ score: 90, tag: "ok" }) } }],
        },
      }),
    });
    const result = await provider.structuredGenerate({
      model: "gpt-4.1-mini",
      schema,
      messages: [{ role: "user", content: "test" }],
    });
    expect(result).toEqual({ score: 90, tag: "ok" });
  });

  test("strips ```json fences before parsing", async () => {
    const provider = new OpenAICompatibleProvider({
      ...baseConfig,
      fetch: fakeFetch({
        body: {
          choices: [
            {
              message: {
                content: "```json\n" + JSON.stringify({ score: 85, tag: "x" }) + "\n```",
              },
            },
          ],
        },
      }),
    });
    const result = await provider.structuredGenerate({
      model: "gpt-4.1-mini",
      schema,
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.score).toBe(85);
  });

  test("throws on HTTP non-2xx with status in the message", async () => {
    const provider = new OpenAICompatibleProvider({
      ...baseConfig,
      fetch: fakeFetch({ ok: false, status: 429, body: { error: { message: "rate limit" } } }),
    });
    let caught: unknown;
    try {
      await provider.structuredGenerate({
        model: "gpt-4.1-mini",
        schema,
        messages: [{ role: "user", content: "test" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("429");
  });

  test("throws ZodError when content is not valid JSON (retry wrapper treats as schema error)", async () => {
    const provider = new OpenAICompatibleProvider({
      ...baseConfig,
      fetch: fakeFetch({
        body: { choices: [{ message: { content: "not json at all" } }] },
      }),
    });
    let caught: unknown;
    try {
      await provider.structuredGenerate({
        model: "gpt-4.1-mini",
        schema,
        messages: [{ role: "user", content: "test" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(z.ZodError);
  });

  test("throws when upstream returns an error envelope", async () => {
    const provider = new OpenAICompatibleProvider({
      ...baseConfig,
      fetch: fakeFetch({ body: { error: { message: "invalid model" } } }),
    });
    let caught: unknown;
    try {
      await provider.structuredGenerate({
        model: "gpt-bad",
        schema,
        messages: [{ role: "user", content: "test" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("invalid model");
  });
});
