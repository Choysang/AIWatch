// Stage 7 output view: sanitized RSS 2.0. Renders the same brief JSON the REST API serves
// into a standard feed for old-school readers (Inoreader etc.). Fact-only summaries — no
// verbatim source quotes (copyright-safe, mirrors the no-gold_quote pipeline contract).

import { XMLBuilder } from "fast-xml-parser";
import type { BriefItem } from "@/db/queries/brief";

export interface RssOptions {
  /** Absolute site origin, e.g. https://aiwatch.icu — used for channel link + item fallback links. */
  origin: string;
  title?: string;
  description?: string;
}

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
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
      link: item.url || `${origin}/events/${item.id}`,
      guid: { "@_isPermaLink": "false", "#text": item.id },
      category: item.category ?? undefined,
      pubDate: pubDate(item),
      description: { __cdata: itemDescription(item) },
    })),
  };

  const doc = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    rss: { "@_version": "2.0", channel },
  };
  return builder.build(doc);
}
