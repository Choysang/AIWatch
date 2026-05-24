// Per-IP token-bucket limiter (decision 13: per-instance, abuse-grade; CDN cache is the
// primary defense, no Redis). In-memory and approximate by design. Pure + injectable
// clock so it is unit-testable.

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * @param capacity max burst tokens
   * @param refillPerSec tokens added per second
   */
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsedSec = Math.max(0, (now - bucket.updatedAt) / 1000);
    const tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);

    if (tokens < 1) {
      // Persist the refilled state so retryAfter is measured from now.
      this.buckets.set(key, { tokens, updatedAt: now });
      const deficit = 1 - tokens;
      return { allowed: false, retryAfterMs: Math.ceil((deficit / this.refillPerSec) * 1000) };
    }

    this.buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drop stale buckets to bound memory (call occasionally). */
  prune(now: number = Date.now(), maxIdleMs = 10 * 60 * 1000): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > maxIdleMs) this.buckets.delete(key);
    }
  }
}
