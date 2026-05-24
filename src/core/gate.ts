// $0 deterministic pre-gate: drops obvious noise BEFORE any LLM call.
// Cheap first cut (AI-relatedness, ads, empty reposts) ahead of the cheap prefilter model.

const AI_KEYWORDS = [
  "ai", "人工智能", "llm", "大模型", "model", "模型", "gpt", "claude", "gemini",
  "llama", "qwen", "deepseek", "mistral", "agent", "智能体", "machine learning",
  "机器学习", "deep learning", "深度学习", "neural", "transformer", "diffusion",
  "rag", "mcp", "openai", "anthropic", "huggingface", "hugging face", "推理",
  "训练", "inference", "fine-tune", "微调", "多模态", "multimodal", "embedding",
];

const AD_KEYWORDS = [
  "限时优惠", "立即购买", "加微信", "扫码", "代理加盟", "点击下载", "免费领取",
  "buy now", "discount code", "promo code", "sponsored", "affiliate link",
];

export interface GateInput {
  title?: string | null;
  content?: string | null;
  isRepost?: boolean;
  hasAddedText?: boolean;
}

export type GateReason = "empty" | "empty_repost" | "ad" | "non_ai";

export interface GateResult {
  pass: boolean;
  reason?: GateReason;
}

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function deterministicGate(input: GateInput): GateResult {
  const text = `${input.title ?? ""}\n${input.content ?? ""}`.trim();
  if (text.length === 0) return { pass: false, reason: "empty" };
  if (input.isRepost && input.hasAddedText === false) {
    return { pass: false, reason: "empty_repost" };
  }
  if (hasAny(text, AD_KEYWORDS)) return { pass: false, reason: "ad" };
  if (!hasAny(text, AI_KEYWORDS)) return { pass: false, reason: "non_ai" };
  return { pass: true };
}
