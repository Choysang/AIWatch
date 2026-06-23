// GET /api/img?u=<absolute image url> — same-origin image proxy for rich article content (B1.5).
// Original-article images are rewritten to this endpoint by rich-blocks.ts so they load without
// (a) leaking the reader's IP to the source, (b) mixed-content blocking, or (c) hotlink refusal.
//
// Security: the URL is SSRF-guarded (http(s)-only, internal/loopback/link-local hosts blocked,
// every redirect hop re-validated) using the same allowlist as full-text extraction. Only raster
// image content-types are served (SVG is rejected — it can carry script). Size + timeout capped.
// Responses are locked down (nosniff, CSP 'none', CORP same-origin) so a served byte stream can
// never be interpreted as an active document.

import { isSafeFetchUrl } from "@/content/extract";
import { TokenBucketLimiter } from "@/public/rate-limit";
import { clientIp, jsonError } from "../public/_runtime";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_REDIRECTS = 3;
const USER_AGENT = "AIWatchBot/1.0 (+https://aiwatch.icu)";
// Raster formats only. SVG is deliberately excluded (it can embed <script>).
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

// Dedicated limiter: image-heavy articles fire many requests, so don't drain the shared bucket.
const imageLimiter = new TokenBucketLimiter(120, 4);

interface FetchedImage {
  contentType: string;
  body: ArrayBuffer;
}

/** Fetch an image, following redirects and re-validating each hop. Null on any failure. */
async function fetchImage(url: string): Promise<FetchedImage | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeFetchUrl(current)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "image/*" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!res.ok) return null;
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) return null;
      const declaredLength = Number(res.headers.get("content-length") ?? "0");
      if (declaredLength && declaredLength > MAX_IMAGE_BYTES) return null;
      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_IMAGE_BYTES) return null;
      return { contentType, body };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null; // too many redirects
}

export async function GET(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get("u");
  if (!target || !isSafeFetchUrl(target)) return jsonError(400, "invalid_url");

  const ip = clientIp(req);
  const rl = imageLimiter.check(`img:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }

  const image = await fetchImage(target);
  if (!image) return jsonError(404, "image_unavailable");

  return new Response(image.body, {
    status: 200,
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.body.byteLength),
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "content-disposition": "inline",
    },
  });
}
