// RSSHub connector for the hard tier (X, Zhihu, Bilibili, Weibo — decision 8). RSSHub
// re-serves these platforms as RSS/Atom, so we reuse parseFeed and only own the routing:
// target = RSSHUB_BASE_URL + the source's connectorRef route (e.g. "/twitter/user/OpenAI").
//
// Fail-closed: if RSSHUB_BASE_URL is unset the connector throws, the crawl task catches it
// and trips that source's breaker. Per spec, hard-tier failure reduces coverage, not
// system availability — other connectors keep running.

import { safeFetch } from "@/net/safe-fetch";
import { parseFeed } from "./rss";
import type { ConnectorSource, RawPost, SourceConnector } from "./types";

/** Join an RSSHub base URL with a source route. An absolute route is returned unchanged. */
export function rsshubUrl(base: string, route: string): string {
  if (/^https?:\/\//i.test(route)) return route;
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`;
}

/**
 * The safeFetch allow-list for a configured RSSHub base. A self-hosted RSSHub
 * (RSSHUB_BASE_URL=http://rsshub:1200) resolves to a Docker private IP, which safeFetch's
 * SSRF guard blocks by default. We whitelist exactly the operator-configured hostname — and
 * nothing else — so internal RSSHub works without opening a blanket SSRF bypass. Returns an
 * empty list (no bypass) when the base is missing or unparseable.
 */
export function rsshubAllowHosts(base: string): string[] {
  try {
    return [new URL(base).hostname];
  } catch {
    return [];
  }
}

/** Minimal fetch signature so tests can pass a plain stub (no `preconnect` etc.). */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface RsshubConnectorOptions {
  /** Override the base URL (tests). Defaults to RSSHUB_BASE_URL read lazily at fetch time. */
  baseUrl?: string;
  /** Override fetch (tests). Defaults to global fetch. */
  fetchImpl?: FetchFn;
}

// Some RSSHub routes (notably /anthropic/research) are valid but slow because they scrape
// rich article listings. Keep this above 40s, while worker concurrency/enqueue caps protect
// the shared RSSHub instance from request storms.
export const RSSHUB_FETCH_TIMEOUT_MS = 60_000;

export class RsshubConnector implements SourceConnector {
  readonly type = "rsshub" as const;
  private readonly baseUrlOverride: string | undefined;
  private readonly fetchImpl: FetchFn | undefined;

  constructor(options: RsshubConnectorOptions = {}) {
    this.baseUrlOverride = options.baseUrl;
    // Tests inject a plain stub; production uses safeFetch (wired in fetch() so it can pass
    // the per-base allow-list — see rsshubAllowHosts).
    this.fetchImpl = options.fetchImpl;
  }

  async fetch(source: ConnectorSource): Promise<RawPost[]> {
    // Read env lazily so the registry can construct one shared instance at import time.
    const base = (
      this.baseUrlOverride ??
      process.env.RSSHUB_BASE_URL ??
      process.env.RSSHUB_URL ??
      ""
    ).trim();
    if (!base) {
      throw new Error(
        `[rsshub] RSSHUB_BASE_URL not configured (fail closed; hard-tier source ${source.id} skipped)`,
      );
    }
    const route = source.connectorRef ?? source.url;
    if (!route) {
      throw new Error(`[rsshub] source ${source.id} has no connectorRef/url route to fetch`);
    }
    const target = rsshubUrl(base, route);
    const headers = { "user-agent": "AIWatch/0.1 (+https://aiwatch.local)" };
    const res = this.fetchImpl
      ? await this.fetchImpl(target, { headers })
      : // Production path: safeFetch with the SSRF guard relaxed only for the operator's
        // configured RSSHub host (self-hosted RSSHub resolves to a Docker-private IP).
        await safeFetch(target, {
          headers,
          allowHosts: rsshubAllowHosts(base),
          timeoutMs: RSSHUB_FETCH_TIMEOUT_MS,
        });
    const body = await res.text();
    if (!res.ok) {
      const detail = summarizeRsshubError(body);
      throw new Error(
        `[rsshub] fetch failed for ${target}: ${res.status} ${res.statusText}${
          detail ? ` — ${detail}` : ""
        }`,
      );
    }
    return parseFeed(body);
  }
}

function summarizeRsshubError(body: string): string {
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const match = text.match(/Error Message:\s*(.*?)(?:\s+Route:|\s+Full Route:|\s+Node Version:|$)/i);
  return (match?.[1] ?? text).slice(0, 240);
}
