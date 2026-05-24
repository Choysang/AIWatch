import type { NextConfig } from "next";

// The Bun worker (worker/) is a separate process and is NOT imported by src/app,
// so Next never compiles it. Keep shared logic in framework-agnostic src/ modules.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
