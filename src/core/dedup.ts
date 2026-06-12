// Deterministic dedup helpers. canonicalizeUrl normalizes URLs for same-event
// resolution; contentHash gives a stable fingerprint. Global dedup happens via
// event resolution, not by rejecting post inserts (posts are unique per source+url).

import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "ref_src", "ref_url", "fbclid", "gclid", "spm", "from", "share_token",
  "s", "cid",
]);

export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    // Drop a trailing slash that sits right before the query or the end.
    return u.toString().replace(/\/(\?|$)/, "$1");
  } catch {
    return raw.trim();
  }
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
