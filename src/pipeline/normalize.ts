// Pure normalization of a RawPost into the derived fields a Post row needs:
// canonical URL, content hash, and a display title following the spec's title rule.
// No DB, no network -> unit-testable.

import type { RawPost } from "@/connectors/types";
import { canonicalizeUrl, contentHash } from "@/core/dedup";

export type TitleSource = "original" | "first_sentence" | "ai_generated";

export interface NormalizedPost {
  canonicalUrl: string | null;
  canonicalReferenceUrls: string[];
  contentHash: string;
  displayTitle: string | null;
  titleSource: TitleSource | null;
}

const FIRST_SENTENCE = /^[\s\S]*?[。．.!！?？\n]/;
const URL_RE = /\bhttps?:\/\/[^\s<>"'）)】]+/g;
const TRAILING_URL_PUNCTUATION = /[.,，。!?！？;；:：]+$/;
const SOCIAL_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "mobile.twitter.com",
  "bsky.app",
  "threads.net",
  "linkedin.com",
  "www.linkedin.com",
]);
const SHORTENER_HOSTS = new Set(["t.co", "bit.ly", "tinyurl.com", "lnkd.in", "buff.ly"]);

/** First sentence (or a trimmed prefix) of a title-less social post. */
function firstSentence(content: string): string {
  const match = content.match(FIRST_SENTENCE);
  const sentence = (match ? match[0] : content).trim().replace(/[。．.!！?？]+$/, "");
  return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

function hostOf(canonicalUrl: string | null): string | null {
  if (!canonicalUrl) return null;
  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return null;
  }
}

function isSocialHost(host: string | null): boolean {
  if (!host) return false;
  return SOCIAL_HOSTS.has(host) || host.endsWith(".twitter.com") || host.endsWith(".linkedin.com");
}

function isShortenerHost(host: string | null): boolean {
  if (!host) return false;
  return SHORTENER_HOSTS.has(host);
}

function hasArticleLikePath(canonicalUrl: string): boolean {
  try {
    const path = new URL(canonicalUrl).pathname;
    return path !== "/" && path.length > 3;
  } catch {
    return false;
  }
}

function extractReferenceUrls(text: string, ownCanonicalUrl: string | null): string[] {
  const ownHost = hostOf(ownCanonicalUrl);
  const out = new Set<string>();
  for (const match of text.matchAll(URL_RE)) {
    const canonical = canonicalizeUrl(match[0].replace(TRAILING_URL_PUNCTUATION, ""));
    const host = hostOf(canonical);
    if (!host || canonical === ownCanonicalUrl) continue;
    if (host === ownHost) continue;
    if (isSocialHost(host) || isShortenerHost(host)) continue;
    if (!hasArticleLikePath(canonical)) continue;
    out.add(canonical);
  }
  return [...out];
}

export function normalizePost(raw: RawPost): NormalizedPost {
  const rawTitle = raw.rawTitle?.trim() || null;
  const rawContent = raw.rawContent?.trim() || null;
  const ownCanonicalUrl = raw.url ? canonicalizeUrl(raw.url) : null;
  const canonicalReferenceUrls = extractReferenceUrls(
    `${rawTitle ?? ""}\n${rawContent ?? ""}`,
    ownCanonicalUrl,
  );
  const canonicalUrl =
    isSocialHost(hostOf(ownCanonicalUrl)) && canonicalReferenceUrls.length === 1
      ? canonicalReferenceUrls[0]!
      : ownCanonicalUrl;

  let displayTitle: string | null = null;
  let titleSource: TitleSource | null = null;
  if (rawTitle) {
    displayTitle = rawTitle;
    titleSource = "original";
  } else if (rawContent) {
    displayTitle = firstSentence(rawContent);
    titleSource = "first_sentence";
  }

  return {
    canonicalUrl,
    canonicalReferenceUrls: canonicalReferenceUrls.filter((url) => url !== canonicalUrl),
    // Hash title+content so the same item from different URLs collides for dedup audit.
    contentHash: contentHash(`${rawTitle ?? ""}\n${rawContent ?? ""}`),
    displayTitle,
    titleSource,
  };
}
