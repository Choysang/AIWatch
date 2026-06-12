// $0 deterministic pre-gate: drops only structural junk BEFORE any LLM call.
// It must never decide value by keyword presence; quiet text-only insights still pass.

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

export type GateReason = "empty" | "empty_repost" | "ad" | "too_short" | "symbol_noise";

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
  if (meaningfulLength(text) < 8) return { pass: false, reason: "too_short" };
  if (meaningfulLength(text) / text.length < 0.35) return { pass: false, reason: "symbol_noise" };
  return { pass: true };
}
