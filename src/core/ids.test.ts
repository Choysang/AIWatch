import { describe, expect, test } from "bun:test";
import { newId } from "./ids";

describe("newId", () => {
  test("carries the type prefix and a 26-char ULID body", () => {
    expect(newId("evt")).toMatch(/^evt_[0-9a-z]{26}$/);
    expect(newId("src")).toMatch(/^src_[0-9a-z]{26}$/);
  });

  test("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("post")));
    expect(ids.size).toBe(1000);
  });

  test("is lexicographically time-sortable", async () => {
    const a = newId("evt");
    await new Promise((r) => setTimeout(r, 3));
    const b = newId("evt");
    expect(a < b).toBe(true);
  });
});
