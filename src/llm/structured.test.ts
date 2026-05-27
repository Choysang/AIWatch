// Unit tests for the retry-once structured-generate wrapper.

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { LLMProvider, StructuredGenerateInput } from "./provider";
import {
  LlmProviderError,
  LlmSchemaError,
  structuredGenerateWithRetry,
} from "./structured";

const schema = z.object({ score: z.number().int().min(0).max(100) });

function makeProvider(behaviour: (attempt: number) => unknown): LLMProvider {
  let attempt = 0;
  return {
    name: "test",
    async structuredGenerate<T>(input: StructuredGenerateInput<T>): Promise<T> {
      attempt++;
      const out = behaviour(attempt);
      if (out instanceof Error) throw out;
      // Mirror real providers: they validate against the supplied schema.
      return input.schema.parse(out);
    },
  };
}

describe("structuredGenerateWithRetry", () => {
  test("returns parsed result on first attempt when output is valid", async () => {
    const provider = makeProvider(() => ({ score: 80 }));
    const result = await structuredGenerateWithRetry(provider, {
      model: "m",
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result).toEqual({ score: 80 });
  });

  test("retries once when the first attempt fails schema validation", async () => {
    const provider = makeProvider((n) => (n === 1 ? { score: "nope" } : { score: 90 }));
    const result = await structuredGenerateWithRetry(provider, {
      model: "m",
      schema,
      messages: [{ role: "user", content: "x" }],
    });
    expect(result).toEqual({ score: 90 });
  });

  test("throws LlmSchemaError when both attempts fail schema validation", async () => {
    const provider = makeProvider(() => ({ score: "still wrong" }));
    let caught: unknown;
    try {
      await structuredGenerateWithRetry(provider, {
        model: "m",
        schema,
        messages: [{ role: "user", content: "x" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LlmSchemaError);
    if (caught instanceof LlmSchemaError) {
      expect(caught.rawAttempts).toBe(2);
      expect(caught.issues.length).toBeGreaterThan(0);
    }
  });

  test("network / upstream errors bubble up as LlmProviderError (no retry)", async () => {
    let calls = 0;
    const provider: LLMProvider = {
      name: "test",
      async structuredGenerate<T>(_input: StructuredGenerateInput<T>): Promise<T> {
        calls++;
        throw new Error("ECONNRESET");
      },
    };
    let caught: unknown;
    try {
      await structuredGenerateWithRetry(provider, {
        model: "m",
        schema,
        messages: [{ role: "user", content: "x" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LlmProviderError);
    expect(calls).toBe(1);
  });
});
