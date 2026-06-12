// Deterministic provider for offline dev, demo seed, and CI. No network/model call.
// Returns a schema-validated fixture (paired with the cold_judge schema in Slice 0).

import type { LLMProvider, StructuredGenerateInput, StructuredResult } from "./provider";

export const DEFAULT_JUDGMENT = {
  domain: "technology",
  score: 82,
  ai_relevance: 80,
  impact: 72,
  novelty: 68,
  audience_usefulness: 76,
  evidence_clarity: 84,
  content_type: "release",
  one_line_summary: "AIWatch 演示源发布了离线测试动态，用于验证抓取、分流、折叠和卡片展示链路。",
  fold: { primary_entity: "aiwatch" },
  detailed_summary:
    "AIWatch 的离线演示数据用于在没有真实模型调用时跑通完整 pipeline。它覆盖轻量分流、代码层门控、语义折叠和富卡片展示，方便开发环境验证结构化字段、评分与标签是否按契约入库。",
  core_viewpoints: [
    "演示数据会完整走过抓取、判断、评分和卡片展示流程。",
    "本地 stub 不代表真实模型判断，只用于开发和测试。",
  ],
  tools: ["AIWatch"],
  people: [],
  tags: ["pipeline", "demo", "agent"],
};

export class StubLLMProvider implements LLMProvider {
  readonly name = "stub";

  constructor(private readonly fixture: Record<string, unknown> = DEFAULT_JUDGMENT) {}

  async structuredGenerate<T>(input: StructuredGenerateInput<T>): Promise<StructuredResult<T>> {
    // Validate the fixture against the caller's schema so the stub honors the contract.
    // Zero usage: the stub makes no real call, so it costs nothing and never trips a budget.
    const fixture = this.fixture === DEFAULT_JUDGMENT ? fixtureForInput(input) : this.fixture;
    return { value: input.schema.parse(fixture), usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function fixtureForInput(input: StructuredGenerateInput<unknown>): Record<string, unknown> {
  const text = input.messages.map((m) => m.content).join("\n");
  if (text.includes("Anthropic") || text.includes("Claude")) {
    return {
      ...DEFAULT_JUDGMENT,
      domain: "product",
      score: 84,
      ai_relevance: 84,
      impact: 76,
      novelty: 70,
      audience_usefulness: 78,
      evidence_clarity: 86,
      content_type: "release",
      one_line_summary: "Anthropic 更新了 Claude 的 Agent 工具调用和长上下文能力，改善复杂任务执行稳定性。",
      fold: { primary_entity: "anthropic" },
      detailed_summary:
        "Anthropic 对 Claude 的 Agent 能力做了更新，重点是更稳定的工具调用和更长上下文窗口。这会影响开发者构建长任务、代码代理和自动化工作流时的模型选择，也提高了复杂多步任务的可控性。",
      tools: ["Claude"],
      people: ["Anthropic"],
      tags: ["Agent", "Claude", "Context"],
    };
  }
  if (text.includes("GitHub Trending") || text.includes("推理框架")) {
    return {
      ...DEFAULT_JUDGMENT,
      domain: "technology",
      score: 81,
      ai_relevance: 82,
      impact: 70,
      novelty: 74,
      audience_usefulness: 78,
      evidence_clarity: 76,
      content_type: "release",
      one_line_summary: "新的开源 LLM 推理框架登上 GitHub Trending，展示消费级 GPU 推理优化空间。",
      fold: { primary_entity: "llm-inference-framework" },
      detailed_summary:
        "一个新的开源 LLM 推理框架获得社区关注，核心卖点是在消费级 GPU 上提升吞吐。对开发者来说，它可能降低本地推理和轻量部署成本，但仍需要实测验证性能、兼容性和长期维护质量。",
      tools: ["LLM inference framework", "GitHub"],
      people: [],
      tags: ["LLM", "Inference", "Open Source"],
    };
  }
  if (text.includes("OpenAI")) {
    return {
      ...DEFAULT_JUDGMENT,
      domain: "product",
      score: 86,
      ai_relevance: 86,
      impact: 78,
      novelty: 72,
      audience_usefulness: 80,
      evidence_clarity: 88,
      content_type: "release",
      one_line_summary: "OpenAI 发布新一代模型并提升推理与多模态能力，同时降低 API 使用成本。",
      fold: { primary_entity: "openai" },
      detailed_summary:
        "OpenAI 发布新一代模型，重点改进推理链路和多模态理解，并下调 API 价格。对开发者和研究者来说，这会改变复杂任务调用成本、模型能力边界和多模态应用的技术选型。",
      tools: ["OpenAI API"],
      people: ["OpenAI"],
      tags: ["Model", "Multimodal", "API"],
    };
  }
  return DEFAULT_JUDGMENT;
}
