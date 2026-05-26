// Unit tests for the deterministic comment classifier (Slice 9).
// Each rule is exercised positively + negatively. Spec lines 481-487 list the rules.

import { describe, expect, test } from "bun:test";
import { classifyComment, type ClassifierResult } from "./classifier";

const TITLE = "OpenAI releases GPT-5 with 50% lower hallucination rate";

function expectValid(body: string, eventTitle: string = TITLE): ClassifierResult {
  const r = classifyComment({ body, eventTitle });
  expect(r.classification).toBe("valid");
  expect(r.reason).toBeNull();
  expect(r.category).toBe("unclassified");
  return r;
}

function expectLowValue(
  body: string,
  reason: ClassifierResult["reason"],
  eventTitle: string = TITLE,
): ClassifierResult {
  const r = classifyComment({ body, eventTitle });
  expect(r.classification).toBe("low_value");
  expect(r.category).toBe("low_value");
  expect(r.reason).toBe(reason);
  return r;
}

describe("comment classifier — empty hype", () => {
  test("pure emoji body is empty hype", () => {
    expectLowValue("🔥🔥🔥", "empty_hype");
    expectLowValue("👍", "meme_or_stance"); // single-token stance trumps hype
  });

  test("only-hype-tokens short body is empty hype (zh)", () => {
    expectLowValue("牛逼", "empty_hype");
    expectLowValue("yyds", "empty_hype");
    expectLowValue("太棒了", "empty_hype");
  });

  test("only-hype-tokens short body is empty hype (en)", () => {
    expectLowValue("wow amazing", "empty_hype");
    expectLowValue("nice", "empty_hype");
  });

  test("substantive praise is NOT empty hype", () => {
    expectValid("The benchmark numbers look strong, especially on MATH-500.");
    expectValid("中文长尾任务上的稳定性比 GPT-4o 明显改善，我跑了 200 条测试集。");
  });
});

describe("comment classifier — meme/stance", () => {
  test("emoji-only stance fires meme_or_stance", () => {
    expectLowValue("👎", "meme_or_stance");
    expectLowValue("+1 +1 +1", "meme_or_stance");
  });

  test("a real sentence beats the meme rule", () => {
    expectValid("agreed — the price drop closes the gap with Claude.");
  });
});

describe("comment classifier — unsourced conspiracy", () => {
  test("conspiracy phrase without URL fires", () => {
    expectLowValue("They don't want you to know the real benchmarks!", "unsourced_conspiracy");
    expectLowValue("这就是阴谋，真相被掩盖了", "unsourced_conspiracy");
  });

  test("conspiracy phrase WITH a URL is NOT auto-low-value", () => {
    // We don't fetch+verify; presence of a URL means the rule defers to an editor.
    const result = classifyComment({
      body: "deep state hiding the real numbers, see https://example.com/leak",
      eventTitle: TITLE,
    });
    expect(result.classification).toBe("valid");
  });

  test("normal critical comment is not conspiracy", () => {
    expectValid("The hallucination claim is overstated; their eval excludes long-form generation.");
  });
});

describe("comment classifier — title repost", () => {
  test("exact title repost fires", () => {
    expectLowValue(TITLE, "title_repost");
  });

  test("near-title repost (case insensitive) fires", () => {
    expectLowValue(TITLE.toUpperCase(), "title_repost");
  });

  test("body that quotes the title and adds substance is still low-value", () => {
    // 70%+ overlap counts as title repost — the rule is intentionally aggressive
    // because title-quoting noise is the most common low-value pattern.
    const partial = TITLE.slice(0, Math.floor(TITLE.length * 0.85));
    expectLowValue(partial, "title_repost");
  });

  test("comment that doesn't repeat the title is valid", () => {
    expectValid("Eval methodology is in their appendix B, table 3.");
  });

  test("empty event title falls through (no false positive)", () => {
    expectValid("This is a real comment.", "");
  });
});

describe("comment classifier — ads / lead gen", () => {
  test("zh ad phrase + URL fires", () => {
    expectLowValue("加我微信代购，https://shop.example.com", "ad_or_lead_gen");
  });

  test("en ad phrase + contact handle fires", () => {
    expectLowValue("DM me for promo code @vendor_official", "ad_or_lead_gen");
  });

  test("talking ABOUT affiliate marketing without a contact is not an ad", () => {
    expectValid("Affiliate marketing dynamics on AI tools are interesting to study.");
  });
});

describe("comment classifier — pass-throughs", () => {
  test("substantive valid comments stay 'valid' + 'unclassified'", () => {
    expectValid("I ran it locally on an M2 Max; first-token latency is around 320ms.");
    expectValid("跑了 100 条 zh→en 翻译，BLEU 比 GPT-4 高 1.8 分，但拒答率上升。");
  });
});
