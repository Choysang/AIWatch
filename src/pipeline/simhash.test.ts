import { describe, expect, test } from "bun:test";
import { hammingDistanceHex, simhash } from "./simhash";

describe("simhash", () => {
  test("is stable and returns 64-bit hex", () => {
    expect(simhash("OpenAI 发布新的 Agent SDK")).toMatch(/^[0-9a-f]{16}$/);
    expect(simhash("OpenAI 发布新的 Agent SDK")).toBe(simhash("OpenAI 发布新的 Agent SDK"));
  });

  test("hamming distance is zero for identical hashes", () => {
    const h = simhash("Anthropic 更新 Claude Code");
    expect(hammingDistanceHex(h, h)).toBe(0);
  });
});
