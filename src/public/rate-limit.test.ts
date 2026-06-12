import { describe, expect, test } from "bun:test";
import { TokenBucketLimiter } from "./rate-limit";

describe("TokenBucketLimiter", () => {
  test("allows up to capacity then blocks", () => {
    const limiter = new TokenBucketLimiter(3, 1);
    const t = 1_000_000;
    expect(limiter.check("ip", t).allowed).toBe(true);
    expect(limiter.check("ip", t).allowed).toBe(true);
    expect(limiter.check("ip", t).allowed).toBe(true);
    const blocked = limiter.check("ip", t);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  test("refills over time", () => {
    const limiter = new TokenBucketLimiter(1, 1); // 1 token/sec
    const t = 2_000_000;
    expect(limiter.check("ip", t).allowed).toBe(true);
    expect(limiter.check("ip", t).allowed).toBe(false);
    expect(limiter.check("ip", t + 1000).allowed).toBe(true); // refilled after 1s
  });

  test("tracks keys independently", () => {
    const limiter = new TokenBucketLimiter(1, 1);
    const t = 3_000_000;
    expect(limiter.check("a", t).allowed).toBe(true);
    expect(limiter.check("b", t).allowed).toBe(true); // different ip, own bucket
    expect(limiter.check("a", t).allowed).toBe(false);
  });
});
