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

  test("drops non-technical event promotion and personal chatter", () => {
    expect(
      deterministicGate({
        title: "今晚八点公开课",
        content: "老师会在社群分享第二次 GEO 公开课，欢迎报名参加。",
      }).reason,
    ).toBe("event_promo");

    expect(
      deterministicGate({
        title: "周末海钓记录",
        content: "钓到一条海鲈鱼，解锁岸边路亚钓海鱼的记录，哈哈哈。",
      }).reason,
    ).toBe("offtopic_personal");
  });

  test("keeps technical events with clear AI context", () => {
    expect(
      deterministicGate({
        title: "OpenAI DevDay workshop",
        content: "演示新的 API、SDK 和 Agent 部署流程。",
      }),
    ).toEqual({ pass: true });
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
