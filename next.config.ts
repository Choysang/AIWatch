import type { NextConfig } from "next";

// The Bun worker (worker/) is a separate process and is NOT imported by src/app,
// so Next never compiles it. Keep shared logic in framework-agnostic src/ modules.

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy (H1). Strict baseline. `connect-src` / `img-src` will widen when
// the downstream Leaderboard Center fetches external APIs/images.
//
// Rollout: shipped as Report-Only by default so a missing directive can't white-screen the
// app. Validate against the running reader + /_admin (watch for inline-style and canvas
// violations), then set CSP_ENFORCE=1 to enforce. Note: enforcing `script-src 'self'`
// with Next's streamed inline bootstrap requires a per-request nonce via middleware; add
// that before flipping enforcement, or the page scripts will be blocked.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
].join("; ");

const cspHeaderName =
  process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

const securityHeaders: { key: string; value: string }[] = [
  { key: cspHeaderName, value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// HSTS only in production (would pin localhost to https in dev otherwise).
if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
