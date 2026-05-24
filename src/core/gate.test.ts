import { describe, expect, test } from "bun:test";
import { deterministicGate } from "./gate";

describe("deterministicGate", () => {
  test("drops empty content", () => {
    expect(deterministicGate({ title: "", content: "" })).toEqual({ pass: false, reason: "empty" });
  });

  test("drops empty reposts", () => {
    const r = deterministicGate({ title: "OpenAI 发布新模型", isRepost: true, hasAddedText: false });
    expect(r.reason).toBe("empty_repost");
  });

  test("drops ads even when AI keywords are present", () => {
    const r = deterministicGate({ title: "全新 GPT 模型", content: "限时优惠 立即购买" });
    expect(r.reason).toBe("ad");
  });

  test("drops non-AI content", () => {
    expect(deterministicGate({ title: "今天天气不错", content: "出去散步" })).toEqual({
      pass: false,
      reason: "non_ai",
    });
  });

  test("passes a real AI item", () => {
    expect(
      deterministicGate({ title: "Anthropic released Claude with a new API", content: "details" }),
    ).toEqual({ pass: true });
  });
});
