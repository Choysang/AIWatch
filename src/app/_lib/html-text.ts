// Display-layer HTML → readable plain text (点10). Raw post content from RSS/RSSHub
// arrives as HTML; the DB keeps it verbatim (immutable input), and we convert at render
// time so "原帖全文" reads like the post did on the source site instead of showing
// literal <br> tags. Outputs plain text (no markup survives), so it is XSS-inert by
// construction and pairs with the existing `white-space: pre-wrap` rendering.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Convert an HTML fragment to readable plain text: <br> and block boundaries become
 * newlines, scripts/styles drop entirely, every other tag is stripped, entities decode,
 * and runs of 3+ newlines collapse to a blank line. Plain-text input passes through
 * (already-readable posts stay untouched apart from entity decoding).
 */
export function htmlToReadableText(value: string): string {
  return decodeEntities(
    value
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|blockquote|h[1-6]|tr|figure|figcaption|pre)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
