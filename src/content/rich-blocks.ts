// Rich-content block model (v0.5 B1.5). Readability gives us cleaned article HTML; instead of
// flattening it to plain text (the original B1 behavior) or rendering raw HTML (an XSS risk), we
// parse it into a STRICT typed block model here. The reader renders that model with React
// elements only (never dangerouslySetInnerHTML), so the output is XSS-inert by construction —
// any tag/attribute we don't explicitly model simply cannot reach the page. Images are rewritten
// to flow through our same-origin proxy (/api/img), so original images load without leaking the
// reader's IP to the source and without mixed-content / hotlink breakage.

import { parseHTML } from "linkedom";
import { isSafeFetchUrl } from "./extract";

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /** Absolute, http(s)-only href; omitted when the source link is unsafe or relative-unresolvable. */
  href?: string;
}

export type RichBlock =
  | { type: "heading"; level: 2 | 3 | 4; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; ordered: boolean; items: InlineSpan[][] }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "code"; code: string }
  | { type: "image"; src: string; alt: string }
  | { type: "table"; header: string[]; rows: string[][] };

const MAX_BLOCKS = 600;
const MAX_TEXT_LEN = 20_000; // per span/cell
const MAX_CODE_LEN = 40_000;
const MAX_LIST_ITEMS = 200;
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 20;

/** Same-origin proxy URL for an external image (already absolute + SSRF-checked by the caller). */
export function proxiedImageUrl(absoluteUrl: string): string {
  return `/api/img?u=${encodeURIComponent(absoluteUrl)}`;
}

function clampText(s: string, max = MAX_TEXT_LEN): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) : t;
}

/** Resolve a possibly-relative href against the article base; keep only safe http(s) links. */
function safeHref(raw: string | null, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  try {
    const abs = new URL(raw, baseUrl).toString();
    return isSafeFetchUrl(abs) ? abs : undefined;
  } catch {
    return undefined;
  }
}

/** Pick the best image URL from src / data-src / srcset, resolve, and proxy it. Null if unsafe. */
function imageSrc(el: ElementLike, baseUrl: string): string | null {
  const candidate =
    el.getAttribute("src") ||
    el.getAttribute("data-src") ||
    (el.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] ||
    "";
  if (!candidate) return null;
  try {
    const abs = new URL(candidate, baseUrl).toString();
    if (!isSafeFetchUrl(abs)) return null;
    return proxiedImageUrl(abs);
  } catch {
    return null;
  }
}

// A minimal structural view of the linkedom node so we don't depend on the full DOM lib types.
interface NodeLike {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<NodeLike>;
}
interface ElementLike extends NodeLike {
  tagName: string;
  getAttribute(name: string): string | null;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function isElement(node: NodeLike): node is ElementLike {
  return node.nodeType === ELEMENT_NODE && typeof (node as ElementLike).tagName === "string";
}

function tag(node: ElementLike): string {
  return node.tagName.toLowerCase();
}

interface SpanCtx {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

/** Recursively collect inline spans from a block element's descendants. */
function collectSpans(node: NodeLike, baseUrl: string, ctx: SpanCtx, out: InlineSpan[]): void {
  if (out.length > 4000) return; // pathological-input guard
  if (node.nodeType === TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    if (text.trim() === "") {
      // keep a single separating space so adjacent inline elements don't glue together
      if (out.length > 0 && text.includes(" ")) out.push({ text: " " });
      return;
    }
    out.push({ text: text.slice(0, MAX_TEXT_LEN), ...ctx });
    return;
  }
  if (!isElement(node)) return;
  const name = tag(node);
  if (name === "br") {
    out.push({ text: "\n" });
    return;
  }
  if (name === "img") return; // images become their own blocks, never inline
  const next: SpanCtx = { ...ctx };
  if (name === "strong" || name === "b") next.bold = true;
  if (name === "em" || name === "i") next.italic = true;
  if (name === "code" || name === "kbd" || name === "samp") next.code = true;
  if (name === "a") {
    const href = safeHref(node.getAttribute("href"), baseUrl);
    if (href) next.href = href;
  }
  for (const child of Array.from(node.childNodes)) collectSpans(child, baseUrl, next, out);
}

/** Trim leading/trailing whitespace-only spans; drop the block if nothing remains. */
function tidySpans(spans: InlineSpan[]): InlineSpan[] {
  const cleaned = spans.filter((s) => s.text !== "");
  while (cleaned.length && cleaned[0]!.text.trim() === "") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1]!.text.trim() === "") cleaned.pop();
  return cleaned;
}

function headingLevel(name: string): 2 | 3 | 4 {
  if (name === "h1" || name === "h2") return 2;
  if (name === "h3") return 3;
  return 4;
}

function parseTable(el: ElementLike): RichBlock | null {
  const rows: string[][] = [];
  let header: string[] = [];
  const trs = Array.from(el.childNodes).flatMap((section) =>
    isElement(section) && (tag(section) === "thead" || tag(section) === "tbody" || tag(section) === "tfoot")
      ? Array.from(section.childNodes)
      : [section],
  );
  for (const tr of trs) {
    if (!isElement(tr) || tag(tr) !== "tr") continue;
    const cells = Array.from(tr.childNodes)
      .filter((c): c is ElementLike => isElement(c) && (tag(c) === "td" || tag(c) === "th"))
      .slice(0, MAX_TABLE_COLS)
      .map((c) => clampText(c.textContent ?? "", 2000));
    if (cells.length === 0) continue;
    const isHeaderRow = Array.from(tr.childNodes).some((c) => isElement(c) && tag(c) === "th");
    if (isHeaderRow && header.length === 0) header = cells;
    else rows.push(cells);
    if (rows.length >= MAX_TABLE_ROWS) break;
  }
  if (header.length === 0 && rows.length === 0) return null;
  return { type: "table", header, rows };
}

/** Walk a node, appending the block(s) it represents (recursing through layout containers). */
function walk(node: NodeLike, baseUrl: string, out: RichBlock[]): void {
  if (out.length >= MAX_BLOCKS) return;
  if (!isElement(node)) return;
  const name = tag(node);

  switch (name) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const spans = tidySpans(collectInto(node, baseUrl));
      if (spans.length) out.push({ type: "heading", level: headingLevel(name), spans });
      return;
    }
    case "p": {
      emitImagesWithin(node, baseUrl, out);
      const spans = tidySpans(collectInto(node, baseUrl));
      if (spans.length) out.push({ type: "paragraph", spans });
      return;
    }
    case "ul":
    case "ol": {
      const items: InlineSpan[][] = [];
      for (const li of Array.from(node.childNodes)) {
        if (!isElement(li) || tag(li) !== "li") continue;
        const spans = tidySpans(collectInto(li, baseUrl));
        if (spans.length) items.push(spans);
        if (items.length >= MAX_LIST_ITEMS) break;
      }
      if (items.length) out.push({ type: "list", ordered: name === "ol", items });
      return;
    }
    case "blockquote": {
      const spans = tidySpans(collectInto(node, baseUrl));
      if (spans.length) out.push({ type: "quote", spans });
      return;
    }
    case "pre": {
      const code = (node.textContent ?? "").replace(/\s+$/, "");
      if (code.trim()) out.push({ type: "code", code: code.slice(0, MAX_CODE_LEN) });
      return;
    }
    case "figure": {
      emitImagesWithin(node, baseUrl, out);
      return;
    }
    case "img": {
      const src = imageSrc(node, baseUrl);
      if (src) out.push({ type: "image", src, alt: clampText(node.getAttribute("alt") ?? "", 400) });
      return;
    }
    case "table": {
      const block = parseTable(node);
      if (block) out.push(block);
      return;
    }
    case "figcaption":
    case "script":
    case "style":
    case "noscript":
    case "iframe":
    case "form":
    case "button":
    case "svg":
      return; // never rendered
    default: {
      // Layout container (div/section/article/main/header/footer/aside/...): recurse into children.
      for (const child of Array.from(node.childNodes)) walk(child, baseUrl, out);
    }
  }
}

function collectInto(node: NodeLike, baseUrl: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  for (const child of Array.from(node.childNodes)) collectSpans(child, baseUrl, {}, spans);
  return spans;
}

/** Pull any <img> descendants out as standalone image blocks (in document order). */
function emitImagesWithin(node: NodeLike, baseUrl: string, out: RichBlock[]): void {
  if (out.length >= MAX_BLOCKS) return;
  if (isElement(node) && tag(node) === "img") {
    const src = imageSrc(node, baseUrl);
    if (src) out.push({ type: "image", src, alt: clampText(node.getAttribute("alt") ?? "", 400) });
    return;
  }
  for (const child of Array.from(node.childNodes)) emitImagesWithin(child, baseUrl, out);
}

/**
 * Parse Readability article HTML into the strict block model. `baseUrl` is the article URL, used
 * to resolve relative links/images. Never throws — returns [] on any parse failure.
 */
export function htmlToBlocks(html: string, baseUrl: string): RichBlock[] {
  try {
    // Wrap in a known container: linkedom places a bare fragment under documentElement (the first
    // element), not <body>, and drops trailing top-level siblings. Wrapping gives one stable root
    // whose childNodes are exactly the article's top-level nodes, in order.
    const { document } = parseHTML(`<div data-aiwatch-root>${html}</div>`);
    const root = (document.documentElement ?? document) as unknown as NodeLike;
    const out: RichBlock[] = [];
    for (const child of Array.from(root.childNodes)) walk(child, baseUrl, out);
    return out.slice(0, MAX_BLOCKS);
  } catch {
    return [];
  }
}
