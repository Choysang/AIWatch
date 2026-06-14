// Full-text extraction (v0.5 B1). On-demand: fetch an ingested article URL and run Mozilla
// Readability to isolate the main article (nav/ads/sidebars stripped). Output is plain text
// (readability's textContent) — XSS-inert by construction like htmlToReadableText, so it
// renders without a sanitizer. The fetch is guarded (http(s)-only, private/loopback/link-local
// hosts blocked, redirects re-validated per hop, timeout + size cap): the URLs come from our
// own curated DB rather than readers, so the SSRF surface is small, but we defend anyway.

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type FullTextStatus = "ok" | "empty" | "error";

export interface ExtractResult {
  status: FullTextStatus;
  text: string;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 3;
const MIN_TEXT_LENGTH = 80; // shorter than this = treat as empty (truncated / blocked page)
const USER_AGENT = "AIWatchBot/1.0 (+https://aiwatch.icu)";

/** IPv4/IPv6 literal in a loopback / private / link-local / CGNAT range. */
function isPrivateIpLiteral(host: string): boolean {
  if (host.includes(":")) {
    const h = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
    if (h.startsWith("::ffff:")) return isPrivateIpLiteral(h.slice(7)); // ipv4-mapped ipv6
    return false;
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false; // a hostname (not an IP literal) — allowed for curated sources
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** Only http(s) to a non-internal host is fetchable. */
export function isSafeFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  return !isPrivateIpLiteral(host);
}

/** Fetch HTML following redirects manually, re-validating each hop. Null on any failure. */
async function fetchHtml(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeFetchUrl(current)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType && !/text\/html|application\/xhtml|application\/xml|text\/plain/i.test(contentType)) {
        return null;
      }
      const declaredLength = Number(res.headers.get("content-length") ?? "0");
      if (declaredLength && declaredLength > MAX_HTML_BYTES) return null;
      const body = await res.text();
      return body.length > MAX_HTML_BYTES ? body.slice(0, MAX_HTML_BYTES) : body;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null; // too many redirects
}

/** Readability extraction over already-fetched HTML (pure — no network). Never throws. */
export function extractReadableText(html: string): ExtractResult {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();
    const text = (article?.textContent ?? "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.length < MIN_TEXT_LENGTH) return { status: "empty", text: "" };
    return { status: "ok", text };
  } catch {
    return { status: "error", text: "" };
  }
}

/** Fetch + readability-extract one article URL into plain text. Never throws. */
export async function extractArticle(url: string): Promise<ExtractResult> {
  if (!isSafeFetchUrl(url)) return { status: "error", text: "" };
  const html = await fetchHtml(url);
  if (html === null) return { status: "error", text: "" };
  return extractReadableText(html);
}
