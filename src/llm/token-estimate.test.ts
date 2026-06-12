import { describe, expect, test } from "bun:test";
import { clampToTokenBudget, estimateTokens, TRUNCATION_MARKER } from "./token-estimate";

describe("estimateTokens", () => {
  test("counts CJK characters as one token each", () => {
    expect(estimateTokens("智能体")).toBe(3);
  });

  test("counts non-CJK at four characters per token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  test("mixes CJK and ASCII costs", () => {
    // 4 CJK tokens + 8 ASCII chars (2 tokens) = 6
    expect(estimateTokens("大模型们abcdefgh")).toBe(6);
  });

  test("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("clampToTokenBudget", () => {
  test("returns text unchanged when within budget", () => {
    const text = "短文本 short text";
    expect(clampToTokenBudget(text, 100)).toBe(text);
  });

  test("clamps over-budget text and inserts the truncation marker", () => {
    const text = "这是开头的重要内容。".repeat(50) + "中间充满了冗长的正文细节。".repeat(200) + "结尾有总结和链接。".repeat(20);
    const clamped = clampToTokenBudget(text, 300);
    expect(clamped).toContain(TRUNCATION_MARKER);
    expect(clamped.startsWith("这是开头的重要内容。")).toBe(true);
    expect(clamped.endsWith("结尾有总结和链接。")).toBe(true);
    // head+tail+marker must come in well under the original
    expect(estimateTokens(clamped)).toBeLessThan(350);
  });

  test("keeps the head dominant over the tail", () => {
    const text = "A".repeat(40_000);
    const clamped = clampToTokenBudget(text, 1000);
    const [head = "", tail = ""] = clamped.split(TRUNCATION_MARKER);
    expect(head.length).toBeGreaterThan(tail.length * 5);
  });

  test("returns empty string for non-positive budget", () => {
    expect(clampToTokenBudget("anything", 0)).toBe("");
  });

  test("long English article clamps to roughly the budget", () => {
    const text = "word ".repeat(30_000); // ~37.5k tokens
    const clamped = clampToTokenBudget(text, 2000);
    expect(estimateTokens(clamped)).toBeLessThanOrEqual(2100);
    expect(estimateTokens(clamped)).toBeGreaterThan(1500);
  });
});
