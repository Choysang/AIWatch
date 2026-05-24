// MockConnector serves deterministic AI-related sample posts with no network.
// Used for the walking-skeleton demo, db seed, and CI. Items are crafted to pass
// the $0 deterministic gate (they mention AI topics) so the full pipeline exercises.

import type { ConnectorSource, RawPost, SourceConnector } from "./types";

const SAMPLE_POSTS: ReadonlyArray<Omit<RawPost, "url"> & { path: string }> = [
  {
    path: "/posts/gpt-next-release",
    externalId: "mock-1",
    authorName: "OpenAI",
    authorHandle: "@OpenAI",
    rawTitle: "OpenAI 发布新一代模型，推理与多模态能力大幅提升",
    rawContent:
      "OpenAI 今天发布了新的大模型，重点改进了推理（inference）链路与多模态理解，并下调了 API 价格。",
    publicMetrics: { likes: 4200, reposts: 1300, replies: 500, comments: 800 },
    publishedAt: new Date("2026-05-23T02:00:00Z"),
  },
  {
    path: "/posts/anthropic-claude-update",
    externalId: "mock-2",
    authorName: "Anthropic",
    authorHandle: "@AnthropicAI",
    rawTitle: "Anthropic 更新 Claude：更强的 agent 工具调用与更长上下文",
    rawContent:
      "Anthropic 宣布 Claude 的 agent 智能体能力升级，工具调用更稳定，并支持更长的上下文窗口。",
    publicMetrics: { likes: 3100, reposts: 900, replies: 300, comments: 420 },
    publishedAt: new Date("2026-05-23T04:30:00Z"),
  },
  {
    path: "/posts/oss-llm-framework",
    externalId: "mock-3",
    authorName: "Community Dev",
    authorHandle: "@oss_dev",
    rawTitle: "新开源 LLM 推理框架登上 GitHub Trending",
    rawContent:
      "一个新的开源大模型（LLM）推理框架今天登上 GitHub Trending，号称在消费级 GPU 上把吞吐提升数倍。",
    publicMetrics: { stars: 620, comments: 140 },
    publishedAt: new Date("2026-05-23T06:15:00Z"),
  },
];

export class MockConnector implements SourceConnector {
  readonly type = "mock" as const;

  async fetch(source: ConnectorSource): Promise<RawPost[]> {
    const base = (source.url ?? "https://mock.aiwatch.local").replace(/\/$/, "");
    return SAMPLE_POSTS.map(({ path, ...rest }) => ({
      ...rest,
      url: `${base}${path}`,
    }));
  }
}
