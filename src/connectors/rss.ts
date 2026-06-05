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

type ParsedMedia = { type: "image" | "video"; url: string; poster?: string };

function isMediaUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function objectText(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function looksLikeVideo(url: string, hint: string | null): boolean {
  const text = `${hint ?? ""} ${url}`.toLowerCase();
  return /\bvideo\b|\.mp4(?:\?|$)|\.webm(?:\?|$)|\.mov(?:\?|$)|\.m3u8(?:\?|$)/.test(text);
}

function mediaFromObject(value: unknown): ParsedMedia | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const url = objectText(obj, ["@_url", "@_href", "url", "href", "src"]);
  if (!isMediaUrl(url)) return null;
  const hint = objectText(obj, ["@_medium", "@_type", "medium", "type", "mime"]);
  const poster = objectText(obj, ["@_poster", "poster", "thumbnail", "thumb"]);
  if (looksLikeVideo(url, hint)) {
    return isMediaUrl(poster) ? { type: "video", url, poster } : { type: "video", url };
  }
  return { type: "image", url };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return isMediaUrl(match?.[1]) ? match[1] : null;
}

function imageFromHtml(value: string | null): string | null {
  if (!value) return null;
  const html = decodeHtml(value);
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return isMediaUrl(match?.[1]) ? match[1] : null;
}

function mediaFromHtml(value: string | null): ParsedMedia | null {
  if (!value) return null;
  const html = decodeHtml(value);
  const videoTag = html.match(/<video\b[^>]*>/i)?.[0] ?? "";
  const videoSrc =
    attr(videoTag, "src") ??
    attr(html.match(/<source\b[^>]*>/i)?.[0] ?? "", "src");
  if (videoSrc) {
    const poster = attr(videoTag, "poster") ?? imageFromHtml(html);
    return poster ? { type: "video", url: videoSrc, poster } : { type: "video", url: videoSrc };
  }
  const image = imageFromHtml(html);
  return image ? { type: "image", url: image } : null;
}

function pickMedia(entry: Record<string, unknown>, rawContent: string | null): ParsedMedia | null {
  const candidates: ParsedMedia[] = [];
  for (const key of ["media:content", "enclosure", "media:thumbnail"]) {
    for (const media of toArray(entry[key] as unknown)) {
      const candidate = mediaFromObject(media);
      if (candidate) candidates.push(candidate);
    }
  }
  const inline = mediaFromHtml(rawContent);
  if (inline) candidates.push(inline);
  const videoWithPoster = candidates.find((media) => media.type === "video" && media.poster);
  if (videoWithPoster) return videoWithPoster;
  const video = candidates.find((media) => media.type === "video");
  const image = candidates.find((media) => media.type === "image");
  if (video && image) return { ...video, poster: image.url };
  return video ?? image ?? null;
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
      media: pickMedia(item, rawContent),
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
