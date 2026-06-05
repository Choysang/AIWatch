// Deterministic provider for offline dev, demo seed, and CI. No network/model call.
// Returns a schema-validated fixture (paired with the cold_judge schema in Slice 0).

import type { LLMProvider, StructuredGenerateInput, StructuredResult } from "./provider";

export const DEFAULT_JUDGMENT = {
  aiRelevance: 80,
  impact: 70,
  novelty: 60,
  audienceUsefulness: 65,
  evidenceClarity: 75,
  title: "示例模型发布事件",
  summary: "（示例）用于离线/演示的占位判断，非真实模型输出。",
  category: "模型",
  contentType: "model_release",
  tags: ["示例", "demo"],
  recommendationReason: "（示例）演示用推荐理由。",
};

export class StubLLMProvider implements LLMProvider {
  readonly name = "stub";

  constructor(private readonly fixture: Record<string, unknown> = DEFAULT_JUDGMENT) {}

  async structuredGenerate<T>(input: StructuredGenerateInput<T>): Promise<StructuredResult<T>> {
    // Validate the fixture against the caller's schema so the stub honors the contract.
    // Zero usage: the stub makes no real call, so it costs nothing and never trips a budget.
    return { value: input.schema.parse(this.fixture), usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
