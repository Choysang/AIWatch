// Shared runtime for /api/public/* (decision 13): one per-instance token-bucket limiter
// (abuse-grade; CDN cache is the primary defense), client-IP extraction, and cache
// headers. Underscore folder -> private, not a route.

import { TokenBucketLimiter } from "@/public/rate-limit";

// ~60 req burst, refilled 1/sec (~60/min) per IP per instance. Approximate by design.
export const publicLimiter = new TokenBucketLimiter(60, 1);

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function cacheControl(sMaxage: number, swr: number): string {
  return `public, s-maxage=${sMaxage}, stale-while-revalidate=${swr}`;
}

export function jsonError(status: number, error: string, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
