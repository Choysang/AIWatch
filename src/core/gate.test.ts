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

  test("does not drop substantial text just because it lacks AI keywords", () => {
    expect(deterministicGate({ title: "一个低调但重要的工程观察", content: "团队发现新的调试流程可以减少上下文切换" })).toEqual({
      pass: true,
    });
  });

  test("drops symbol-only noise", () => {
    expect(deterministicGate({ title: "🔥🔥🔥", content: "!!!" }).reason).toBe("too_short");
  });

  test("passes a real AI item", () => {
    expect(
      deterministicGate({ title: "Anthropic released Claude with a new API", content: "details" }),
    ).toEqual({ pass: true });
  });
});
