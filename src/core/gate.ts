// $0 deterministic pre-gate: drops only structural junk BEFORE any LLM call.
// It must never decide value by keyword presence; quiet text-only insights still pass.

const AD_KEYWORDS = [
  "限时优惠", "立即购买", "加微信", "扫码", "代理加盟", "点击下载", "免费领取",
  "buy now", "discount code", "promo code", "sponsored", "affiliate link",
];
const EVENT_PROMO_RE =
  /(公开课|直播|分享会|观赛派对|报名|课程|训练营|webinar|workshop|meetup|event registration)/i;
const PERSONAL_NOISE_RE =
  /(钓鱼|海钓|路亚|美食|旅游|健身|心情|哈哈哈|环境决定 fitness|不要总怀疑自己)/i;
const AI_TECH_CONTEXT_RE =
  /(ai|llm|gpt|claude|openai|anthropic|模型|智能体|agent|rag|api|sdk|benchmark|基准|开源|代码|部署|评测|训练|推理|自动驾驶|多模态)/i;

export interface GateInput {
  title?: string | null;
  content?: string | null;
  isRepost?: boolean;
  hasAddedText?: boolean;
}

export type GateReason =
  | "empty"
  | "empty_repost"
  | "ad"
  | "event_promo"
  | "offtopic_personal"
  | "too_short"
  | "symbol_noise";

export interface GateResult {
  pass: boolean;
  reason?: GateReason;
}

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function meaningfulLength(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

export function deterministicGate(input: GateInput): GateResult {
  const text = `${input.title ?? ""}\n${input.content ?? ""}`.trim();
  if (text.length === 0) return { pass: false, reason: "empty" };
  if (input.isRepost && input.hasAddedText === false) {
    return { pass: false, reason: "empty_repost" };
  }
  if (hasAny(text, AD_KEYWORDS)) return { pass: false, reason: "ad" };
  if (EVENT_PROMO_RE.test(text) && !AI_TECH_CONTEXT_RE.test(text)) {
    return { pass: false, reason: "event_promo" };
  }
  if (PERSONAL_NOISE_RE.test(text) && !AI_TECH_CONTEXT_RE.test(text)) {
    return { pass: false, reason: "offtopic_personal" };
  }
  if (meaningfulLength(text) < 8) return { pass: false, reason: "too_short" };
  if (meaningfulLength(text) / text.length < 0.35) return { pass: false, reason: "symbol_noise" };
  return { pass: true };
}
