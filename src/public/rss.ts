// Stage 7 output view: sanitized RSS 2.0. Renders the same brief JSON the REST API serves
// into a standard feed for old-school readers (Inoreader etc.). Fact-only summaries — no
// verbatim source quotes (copyright-safe, mirrors the no-gold_quote pipeline contract).

import { XMLBuilder } from "fast-xml-parser";
import type { BriefItem } from "@/db/queries/brief";
import type { InlineSpan, RichBlock } from "@/content/rich-blocks";
import { extractImageUrl, proxiedImageUrl } from "@/app/_lib/media";

export interface RssOptions {
  /** Absolute site origin, e.g. https://aiwatch.icu — used for channel link + item fallback links. */
  origin: string;
  title?: string;
  description?: string;
}

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: false,
  cdataPropName: "__cdata",
  suppressEmptyNode: true,
});

function itemDescription(item: BriefItem): string {
  // T2 carries a detailed summary; T1 only the one-liner. Never the raw source text.
  return item.detailed_summary?.trim() || item.one_line_summary?.trim() || item.title;
}

function pubDate(item: BriefItem): string {
  const iso = item.published_at ?? item.updated_at;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absoluteUrl(url: string, origin: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function proxiedAbsoluteImage(url: string, origin: string): string {
  if (url.startsWith("/api/img?")) return absoluteUrl(url, origin);
  if (/^https?:\/\//i.test(url)) return absoluteUrl(proxiedImageUrl(url), origin);
  return absoluteUrl(url, origin);
}

function renderSpans(spans: readonly InlineSpan[]): string {
  return spans
    .map((span) => {
      let html = span.code ? `<code>${escapeHtml(span.text)}</code>` : escapeHtml(span.text);
      if (span.bold) html = `<strong>${html}</strong>`;
      if (span.italic) html = `<em>${html}</em>`;
      if (span.href) html = `<a href="${escapeHtml(span.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

function renderBlock(block: RichBlock, origin: string): string {
  if (block.type === "heading") return `<h${block.level}>${renderSpans(block.spans)}</h${block.level}>`;
  if (block.type === "paragraph") return `<p>${renderSpans(block.spans)}</p>`;
  if (block.type === "quote") return `<blockquote>${renderSpans(block.spans)}</blockquote>`;
  if (block.type === "code") return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
  if (block.type === "image") {
    return `<figure><img src="${escapeHtml(proxiedAbsoluteImage(block.src, origin))}" alt="${escapeHtml(block.alt)}" /></figure>`;
  }
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    const items = block.items.map((item) => `<li>${renderSpans(item)}</li>`).join("");
    return `<${tag}>${items}</${tag}>`;
  }
  const head =
    block.header.length > 0
      ? `<thead><tr>${block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`
      : "";
  const rows = block.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${head}<tbody>${rows}</tbody></table>`;
}

function paragraphFallback(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join("");
}

function itemContentHtml(item: BriefItem, origin: string): string {
  const mediaUrl = extractImageUrl(item.media);
  const media = mediaUrl
    ? `<figure><img src="${escapeHtml(proxiedAbsoluteImage(mediaUrl, origin))}" alt="" /></figure>`
    : "";
  const rich =
    item.full_blocks.length > 0
      ? item.full_blocks.map((block) => renderBlock(block, origin)).join("")
      : "";
  const body =
    rich ||
    paragraphFallback(
      item.body?.trim() ||
        item.full_text?.trim() ||
        item.detailed_summary?.trim() ||
        item.one_line_summary?.trim() ||
        item.title,
    );
  return `${media}${body}`;
}

/** Render brief items as an RSS 2.0 XML document string. Pure — no I/O, unit-testable. */
export function renderRssFeed(items: readonly BriefItem[], opts: RssOptions): string {
  const origin = opts.origin.replace(/\/+$/, "");
  const channel = {
    title: opts.title ?? "AIWatch · AI-Dev 情报",
    link: origin,
    description: opts.description ?? "策展式 AI-Dev 垂直情报，最高信噪比的 AI/开发资讯。",
    language: "zh-cn",
    lastBuildDate: new Date().toUTCString(),
    item: items.map((item) => ({
      title: { __cdata: item.title },
      link: absoluteUrl(item.permalink ?? `/events/${item.id}`, origin),
      guid: { "@_isPermaLink": "false", "#text": item.id },
      category: item.category ?? undefined,
      pubDate: pubDate(item),
      source: item.url
        ? { "@_url": item.url, "#text": item.source.name ?? item.url }
        : undefined,
      description: { __cdata: itemDescription(item) },
      "content:encoded": { __cdata: itemContentHtml(item, origin) },
    })),
  };

  const doc = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    rss: { "@_version": "2.0", "@_xmlns:content": "http://purl.org/rss/1.0/modules/content/", channel },
  };
  return builder.build(doc);
}
