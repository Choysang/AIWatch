import type { NextConfig } from "next";

// The Bun worker (worker/) is a separate process and is NOT imported by src/app,
// so Next never compiles it. Keep shared logic in framework-agnostic src/ modules.

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy (H1). Strict baseline. `connect-src` / `img-src` will widen when
// the downstream Leaderboard Center fetches external APIs/images.
//
// Rollout: production enforces by default. Next's streamed RSC bootstrap currently emits
// inline scripts, so allow them until a nonce-based middleware path is introduced.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "media-src 'self' https: data: blob:",
  "form-action 'self'",
].join("; ");

const cspHeaderName =
  isProd && process.env.CSP_ENFORCE !== "0"
    ? "Content-Security-Policy"
    : process.env.CSP_ENFORCE === "1"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";

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
