// Cheap language-aware token estimation + budget clamping for LLM inputs.
//
// routing.ts declares maxInputTokens per task but nothing enforced it, so an 80k-char
// blog post went to the judge whole (~25k tokens for one triage call). These pure
// helpers clamp untrusted source text to a token budget before it enters a prompt.
//
// Heuristic: CJK chars ≈ 1 token each; everything else ≈ 4 chars per token. That is
// deliberately conservative for mixed Chinese/English feed content — close enough for
// budgeting, no tokenizer dependency.

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

const NON_CJK_CHARS_PER_TOKEN = 4;

/** Marker inserted where clamped text was cut. */
export const TRUNCATION_MARKER = "\n…（内容过长，中间已截断）…\n";

/** Estimate the token count of `text` (CJK=1 token/char, other=1/4 token/char). */
export function estimateTokens(text: string): number {
  let cost = 0;
  for (const ch of text) {
    cost += CJK_RE.test(ch) ? 1 : 1 / NON_CJK_CHARS_PER_TOKEN;
  }
  return Math.ceil(cost);
}

/** Index just past the longest prefix of `text` that fits `budget` tokens. */
function prefixEnd(text: string, budget: number): number {
  let cost = 0;
  let index = 0;
  for (const ch of text) {
    cost += CJK_RE.test(ch) ? 1 : 1 / NON_CJK_CHARS_PER_TOKEN;
    if (cost > budget) break;
    index += ch.length; // surrogate pairs advance by 2
  }
  return index;
}

/** Index of the start of the longest suffix of `text` that fits `budget` tokens. */
function suffixStart(text: string, budget: number): number {
  const chars = Array.from(text);
  let cost = 0;
  let index = text.length;
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i]!;
    cost += CJK_RE.test(ch) ? 1 : 1 / NON_CJK_CHARS_PER_TOKEN;
    if (cost > budget) break;
    index -= ch.length;
  }
  return index;
}

/**
 * Clamp `text` to roughly `maxTokens` estimated tokens. Text already in budget is
 * returned unchanged. Over-budget text keeps the head (~85% of budget — leads carry
 * the classification signal) plus the tail (~10% — closing summary/links), joined by
 * TRUNCATION_MARKER.
 */
export function clampToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return "";
  if (estimateTokens(text) <= maxTokens) return text;

  const headBudget = Math.floor(maxTokens * 0.85);
  const tailBudget = Math.floor(maxTokens * 0.1);
  const head = text.slice(0, prefixEnd(text, headBudget));
  const tail = tailBudget > 0 ? text.slice(suffixStart(text, tailBudget)) : "";
  return `${head}${TRUNCATION_MARKER}${tail}`;
}
