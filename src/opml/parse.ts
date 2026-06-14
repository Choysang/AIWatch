// OPML parser (v0.5 A4.2). Pure, dependency-free: pulls feed outlines out of an uploaded
// OPML document so each becomes a source-recommendation contribution (owner-reviewed).
// Regex-based on purpose — OPML attributes are double-quoted by spec and the surface is
// small; we only need outlines that carry an xmlUrl (folder outlines have none). Caps the
// count so a hostile file can't flood the contributions table.

export interface ParsedFeed {
  title: string;
  xmlUrl: string;
  htmlUrl: string | null;
}

export const MAX_IMPORT_FEEDS = 50;
const MAX_TITLE_LENGTH = 200;

/** Reverse the five predefined entities + numeric character references. Ampersand last. */
function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Parse the attribute string of one tag into a lower-cased attr map (double-quoted only). */
function parseAttrs(tagBody: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tagBody)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) map.set(key.toLowerCase(), value);
  }
  return map;
}

/**
 * Extract subscribable feed outlines from an OPML document. Keeps only outlines with a
 * valid http(s) xmlUrl, de-duped by xmlUrl, capped at `max`. Title falls back text -> title
 * -> the feed URL.
 */
export function parseOpml(xml: string, max = MAX_IMPORT_FEEDS): ParsedFeed[] {
  const feeds: ParsedFeed[] = [];
  const seen = new Set<string>();
  const outlineRe = /<outline\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = outlineRe.exec(xml)) !== null) {
    const attrs = parseAttrs(match[1] ?? "");
    const xmlUrlRaw = attrs.get("xmlurl");
    if (!xmlUrlRaw) continue;
    const xmlUrl = unescapeXml(xmlUrlRaw).trim();
    if (!isHttpUrl(xmlUrl) || seen.has(xmlUrl)) continue;
    seen.add(xmlUrl);

    const titleRaw = attrs.get("text") ?? attrs.get("title") ?? xmlUrl;
    const title = unescapeXml(titleRaw).trim().slice(0, MAX_TITLE_LENGTH) || xmlUrl;
    const htmlRaw = attrs.get("htmlurl");
    const htmlCandidate = htmlRaw ? unescapeXml(htmlRaw).trim() : "";
    const htmlUrl = htmlCandidate && isHttpUrl(htmlCandidate) ? htmlCandidate : null;

    feeds.push({ title, xmlUrl, htmlUrl });
    if (feeds.length >= max) break;
  }
  return feeds;
}
