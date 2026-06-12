// Deterministic comment classifier (Slice 9, spec lines 473-487).
//
// Spec gives us two enumerations:
//   * Valid categories (5): praise, criticism, handson, supplement, controversy
//   * Low-value rules (5): empty hype, memes/pure stance, unsourced conspiracy,
//                          title reposts, ads / lead generation
//
// V1 implements only the low-value side deterministically — high-precision filtering
// for the worst patterns. Valid categorization stays "unclassified" until a future
// slice adds either editor curation or a separate LLM step. The fence is intentional:
// classification gates *visibility* (low_value comments don't surface), so we want
// false-negatives (let a borderline comment through) over false-positives (silently
// hiding good comments).
//
// All rules operate on the comment body in isolation + the event title (for the
// "title repost" rule). Language-agnostic where possible; the hype/meme keyword lists
// cover the V1 audience (zh + en).

export type CommentCategory =
  | "praise"
  | "criticism"
  | "handson"
  | "supplement"
  | "controversy"
  | "low_value"
  | "unclassified";

export type CommentClassification = "valid" | "low_value";

export interface ClassifierInput {
  body: string;
  /** The event title; used by the title-repost rule. Pass "" if not applicable. */
  eventTitle: string;
}

export interface ClassifierResult {
  classification: CommentClassification;
  category: CommentCategory;
  /** Which rule fired, for audit logs + tests. null when classification === "valid". */
  reason: LowValueReason | null;
}

export type LowValueReason =
  | "empty_hype"
  | "meme_or_stance"
  | "unsourced_conspiracy"
  | "title_repost"
  | "ad_or_lead_gen";

// --- rule constants (extracted for tests; tweak deliberately, not in passing) ---

// "Empty hype" tokens (zh + en). A body that consists *only* of these (after stripping
// emoji + punctuation + whitespace) is empty hype. We intentionally keep this list
// short — false-positives here silently hide praise.
const HYPE_TOKENS = new Set([
  // zh
  "好", "好的", "棒", "牛", "牛逼", "厉害", "yyds", "顶", "赞", "支持", "加油",
  "太棒了", "太牛了", "绝绝子", "真香", "可以的", "卧槽", "牛批", "牛b", "牛x",
  // en
  "wow", "amazing", "awesome", "great", "cool", "nice", "lol", "lmao",
  "based", "goat", "fire", "lit", "this", "thread", "+1",
]);

// "Pure stance" tokens — emoji-only or single short stance words.
const STANCE_TOKENS = new Set([
  "👍", "👎", "🔥", "💯", "❤", "❤️", "😂", "🤣", "😅", "🤡",
  "+1", "-1", "agreed", "disagree", "this", "no", "yes",
]);

// Words that strongly signal conspiracy framing *without* any URL/citation present.
const CONSPIRACY_PHRASES_ZH = [
  "阴谋", "真相被掩盖", "他们不让你看", "深层国家", "操控", "幕后黑手",
];
const CONSPIRACY_PHRASES_EN = [
  "they don't want you to know",
  "wake up",
  "hidden truth",
  "deep state",
  "cover-up",
  "psyop",
  "shadow government",
];

// Ad / lead-gen patterns: contact links, promo words paired with a URL or contact id.
const AD_PHRASES_ZH = ["加我微信", "私聊", "扫码", "代购", "返利", "优惠码", "推广", "招代理"];
const AD_PHRASES_EN = ["dm me", "promo code", "affiliate", "buy now", "join my", "sign up at"];

const URL_RE = /\bhttps?:\/\/\S+/i;
const CONTACT_RE = /(?:wechat|微信|qq|telegram|@[a-z0-9_]{3,})/i;

/** Strip emoji + punctuation + whitespace to test for "only stance/emoji" bodies. */
function stripDecoration(text: string): string {
  // Unicode emoji ranges (BMP supplement + emoji presentation). Keep alphanum + CJK.
  // We intentionally do not strip Latin letters or CJK characters here.
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

/** Tokenize on whitespace + ASCII punctuation, keep CJK as individual tokens. We
 * deliberately don't split on `+` so "+1" survives as a single stance token. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:()[\]"'`~/\\|<>@#$%^&*=]+/u)
    .filter(Boolean);
}

/** Empty hype: no substantive content. Either nothing left after stripping decoration,
 * or every token is a hype word regardless of body length. We don't gate on length
 * because "wow amazing nice cool" is just as empty as "牛逼". */
function isEmptyHype(body: string): boolean {
  const stripped = stripDecoration(body);
  if (stripped.length === 0) return true;
  const tokens = tokenize(body);
  if (tokens.length === 0) return true;
  return tokens.every((t) => HYPE_TOKENS.has(t));
}

function isMemeOrStance(body: string): boolean {
  const tokens = tokenize(body);
  if (tokens.length === 0) return false; // empty already covered upstream
  if (tokens.length > 3) return false; // anything substantive escapes this rule
  return tokens.every((t) => STANCE_TOKENS.has(t));
}

function isUnsourcedConspiracy(body: string): boolean {
  const lower = body.toLowerCase();
  const hasConspiracyPhrase =
    CONSPIRACY_PHRASES_ZH.some((p) => body.includes(p)) ||
    CONSPIRACY_PHRASES_EN.some((p) => lower.includes(p));
  if (!hasConspiracyPhrase) return false;
  // A URL counts as a source for our purposes (we don't fetch + verify; that's an
  // editor's call). Bare claims with no URL fire the rule.
  return !URL_RE.test(body);
}

function isTitleRepost(body: string, eventTitle: string): boolean {
  // Skip when the title is too short to meaningfully "repost" — a 1-2 char title
  // would otherwise match every body that happens to contain that letter.
  if (!eventTitle || eventTitle.trim().length < 8) return false;
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const nb = normalize(body);
  const nt = normalize(eventTitle);
  if (nb.length === 0 || nt.length === 0) return false;
  if (nb === nt) return true;
  // The body must be the same order of magnitude as the title; a 200-char body that
  // happens to contain the title isn't a repost, it's a discussion.
  const ratio = nb.length / nt.length;
  if (ratio < 0.6 || ratio > 1.5) return false;
  return nt.includes(nb) || nb.includes(nt);
}

function isAdOrLeadGen(body: string): boolean {
  const lower = body.toLowerCase();
  const hasAdPhrase =
    AD_PHRASES_ZH.some((p) => body.includes(p)) ||
    AD_PHRASES_EN.some((p) => lower.includes(p));
  if (!hasAdPhrase) return false;
  // Phrase plus a URL or contact handle = ad. Phrase alone (e.g. someone *talking
  // about* "affiliate marketing") doesn't fire.
  return URL_RE.test(body) || CONTACT_RE.test(body);
}

/**
 * Classify a comment. Order matters:
 *   1. title_repost — most actionable for moderators ("they just quoted the title")
 *   2. ad_or_lead_gen — promotional content that also looks substantive
 *   3. unsourced_conspiracy — distinct framing
 *   4. meme_or_stance — runs BEFORE empty_hype so single emojis like "👍" tag as
 *      stance (the more specific category) rather than the catch-all empty bucket
 *   5. empty_hype — catch-all "no substantive content" rule
 */
export function classifyComment(input: ClassifierInput): ClassifierResult {
  const body = input.body ?? "";
  const eventTitle = input.eventTitle ?? "";

  if (isTitleRepost(body, eventTitle)) {
    return { classification: "low_value", category: "low_value", reason: "title_repost" };
  }
  if (isAdOrLeadGen(body)) {
    return { classification: "low_value", category: "low_value", reason: "ad_or_lead_gen" };
  }
  if (isUnsourcedConspiracy(body)) {
    return {
      classification: "low_value",
      category: "low_value",
      reason: "unsourced_conspiracy",
    };
  }
  if (isMemeOrStance(body)) {
    return { classification: "low_value", category: "low_value", reason: "meme_or_stance" };
  }
  if (isEmptyHype(body)) {
    return { classification: "low_value", category: "low_value", reason: "empty_hype" };
  }
  return { classification: "valid", category: "unclassified", reason: null };
}

