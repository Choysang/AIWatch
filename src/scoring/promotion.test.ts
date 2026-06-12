import { describe, expect, test } from "bun:test";
import { levelRank } from "./promotion";

describe("levelRank", () => {
  test("orders none < B < A < S", () => {
    expect(levelRank("none")).toBeLessThan(levelRank("B"));
    expect(levelRank("B")).toBeLessThan(levelRank("A"));
    expect(levelRank("A")).toBeLessThan(levelRank("S"));
  });
});
