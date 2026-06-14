// OPML 2.0 serializer (v0.5 A4.1). Pure, dependency-free: turns a flat list of feed
// outlines into a category-grouped OPML document a reader can import into any feed reader.
// Used by GET /api/boards/opml to export the curated RSS-family sources. We hand-escape XML
// (no library) because the surface is tiny and fully under our control.

export interface OpmlOutline {
  /** Feed title (outline text/title attribute). */
  text: string;
  /** The subscribable feed URL (xmlUrl). Required — an outline without it isn't a feed. */
  xmlUrl: string;
  /** Human-facing homepage (htmlUrl), optional. */
  htmlUrl?: string | null;
  /** Grouping folder; outlines without one fall under FALLBACK_CATEGORY. */
  category?: string | null;
}

export interface OpmlDocument {
  title: string;
  outlines: OpmlOutline[];
}

const FALLBACK_CATEGORY = "未分类";

/** Escape the five XML predefined entities. Order matters: ampersand first. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serialize an OPML 2.0 document. Outlines are grouped into category folders (stable
 * insertion order). Deterministic given the same inputs + `now`, so it is unit-testable.
 */
export function buildOpml(doc: OpmlDocument, now: Date = new Date()): string {
  const groups = new Map<string, OpmlOutline[]>();
  for (const outline of doc.outlines) {
    const category = outline.category?.trim() || FALLBACK_CATEGORY;
    const bucket = groups.get(category);
    if (bucket) bucket.push(outline);
    else groups.set(category, [outline]);
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    `    <title>${escapeXml(doc.title)}</title>`,
    `    <dateCreated>${now.toUTCString()}</dateCreated>`,
    "  </head>",
    "  <body>",
  ];
  for (const [category, items] of groups) {
    const folder = escapeXml(category);
    lines.push(`    <outline text="${folder}" title="${folder}">`);
    for (const item of items) {
      const title = escapeXml(item.text);
      const html = item.htmlUrl ? ` htmlUrl="${escapeXml(item.htmlUrl)}"` : "";
      lines.push(
        `      <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeXml(item.xmlUrl)}"${html} />`,
      );
    }
    lines.push("    </outline>");
  }
  lines.push("  </body>", "</opml>", "");
  return lines.join("\n");
}
