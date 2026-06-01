// RSS/Atom connector. Parses a feed into RawPost[]. Real network adapter; in CI it
// is exercised against recorded fixtures via parseFeed (no live network in tests).

import { XMLParser } from "fast-xml-parser";
import type { ConnectorSource, RawPost, SourceConnector } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  // Atom <link href="..."> or CDATA wrapped objects.
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return (obj["#text"] as string).trim() || null;
    if (typeof obj["@_href"] === "string") return (obj["@_href"] as string).trim() || null;
  }
  return null;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseDate(value: unknown): Date | null {
  const text = asText(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickLink(entry: Record<string, unknown>): string | null {
  const links = toArray(entry.link as unknown);
  for (const link of links) {
    const href = asText(link);
    if (href) return href;
  }
  return null;
}

function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function imageFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (isImageUrl(obj["@_url"])) return obj["@_url"];
  if (isImageUrl(obj["@_href"])) return obj["@_href"];
  if (isImageUrl(obj.url)) return obj.url;
  return null;
}

function imageFromHtml(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return isImageUrl(match?.[1]) ? match[1] : null;
}

function pickImage(entry: Record<string, unknown>, rawContent: string | null): { url: string } | null {
  const mediaContent = toArray(entry["media:content"] as unknown);
  for (const media of mediaContent) {
    const url = imageFromObject(media);
    if (url) return { url };
  }
  const enclosures = toArray(entry.enclosure as unknown);
  for (const enclosure of enclosures) {
    const url = imageFromObject(enclosure);
    if (url) return { url };
  }
  const inline = imageFromHtml(rawContent);
  return inline ? { url: inline } : null;
}

/** Pure: parse a feed XML string into RawPost[]. The unit-testable core of the connector. */
export function parseFeed(xml: string): RawPost[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined; // Atom

  const items = channel
    ? toArray(channel.item as unknown)
    : toArray(feed?.entry as unknown);

  return (items as Record<string, unknown>[]).map((item) => {
    const author =
      asText(item.author) ??
      asText(item["dc:creator"]) ??
      (item.author && typeof item.author === "object"
        ? asText((item.author as Record<string, unknown>).name)
        : null);
    const rawContent =
      asText(item.description) ??
      asText(item["content:encoded"]) ??
      asText(item.content) ??
      asText(item.summary);
    return {
      externalId: asText(item.guid) ?? asText(item.id) ?? pickLink(item),
      authorName: author,
      authorHandle: null,
      url: pickLink(item),
      rawTitle: asText(item.title),
      rawContent,
      media: pickImage(item, rawContent),
      publicMetrics: null,
      publishedAt: parseDate(item.pubDate) ?? parseDate(item.published) ?? parseDate(item.updated),
    } satisfies RawPost;
  });
}

export class RssConnector implements SourceConnector {
  readonly type = "rss" as const;

  async fetch(source: ConnectorSource): Promise<RawPost[]> {
    const target = source.connectorRef ?? source.url;
    if (!target) {
      throw new Error(`[rss] source ${source.id} has no connectorRef/url to fetch`);
    }
    const res = await fetch(target, {
      headers: { "user-agent": "AIWatch/0.1 (+https://aiwatch.local)" },
    });
    if (!res.ok) {
      throw new Error(`[rss] fetch failed for ${target}: ${res.status} ${res.statusText}`);
    }
    return parseFeed(await res.text());
  }
}
