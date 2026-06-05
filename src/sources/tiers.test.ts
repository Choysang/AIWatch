import { describe, expect, test } from "bun:test";
import type { SourceLevel } from "@/scoring/types";
import { tierFetchFrequency } from "./tiers";

describe("tierFetchFrequency", () => {
  test("maps each level to a crawl interval capped at 10 minutes", () => {
    expect(tierFetchFrequency("L1")).toBe("5 minutes");
    expect(tierFetchFrequency("L2")).toBe("10 minutes");
    expect(tierFetchFrequency("L3")).toBe("10 minutes");
    expect(tierFetchFrequency("L4")).toBe("10 minutes");
    expect(tierFetchFrequency("L5")).toBe("10 minutes");
  });

  test("covers every source level", () => {
    const levels: SourceLevel[] = ["L1", "L2", "L3", "L4", "L5"];
    for (const level of levels) {
      expect(typeof tierFetchFrequency(level)).toBe("string");
    }
  });
});
