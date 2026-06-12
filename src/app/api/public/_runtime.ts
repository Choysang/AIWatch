// Shared runtime for /api/public/* (decision 13): one per-instance token-bucket limiter
// (abuse-grade; CDN cache is the primary defense), client-IP extraction, and cache
// headers. Underscore folder -> private, not a route.

import { TokenBucketLimiter } from "@/public/rate-limit";

// ~60 req burst, refilled 1/sec (~60/min) per IP per instance. Approximate by design.
export const publicLimiter = new TokenBucketLimiter(60, 1);

// Client IP for rate-limit/fingerprint keys (M1). `X-Forwarded-For` is a client-controlled
// list; an attacker can prepend fake entries on the LEFT. Only the rightmost hops are
// appended by infrastructure we trust, so we read the hop `TRUSTED_PROXY_HOPS` from the
// right: 0 (default) = the directly-connected peer (least spoofable, no proxy); 1 = one
// trusted CDN/proxy in front (its view of the real client); etc. Deploy behind a trusted
// proxy/CDN and set this to the number of proxies that rewrite XFF.
export function clientIp(req: Request): string {
  const hops = Math.max(0, Math.trunc(Number(process.env.TRUSTED_PROXY_HOPS ?? "0")) || 0);
  const xff = req.headers.get("x-forwarded-for");
  if (hops > 0 && xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      const idx = Math.max(0, parts.length - hops);
      return parts[idx]!;
    }
  }
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
