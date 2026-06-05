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

/** Minimal fetch signature so tests can pass a plain stub (no `preconnect` etc.). */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface RsshubConnectorOptions {
  /** Override the base URL (tests). Defaults to RSSHUB_BASE_URL read lazily at fetch time. */
  baseUrl?: string;
  /** Override fetch (tests). Defaults to global fetch. */
  fetchImpl?: FetchFn;
}

export class RsshubConnector implements SourceConnector {
  readonly type = "rsshub" as const;
  private readonly baseUrlOverride: string | undefined;
  private readonly fetchImpl: FetchFn;

  constructor(options: RsshubConnectorOptions = {}) {
    this.baseUrlOverride = options.baseUrl;
    // Default to the SSRF/timeout/byte-capped safeFetch; tests still inject a plain stub.
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => safeFetch(url, { headers: init?.headers as Record<string, string> | undefined }));
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
    const res = await this.fetchImpl(target, {
      headers: { "user-agent": "AIWatch/0.1 (+https://aiwatch.local)" },
    });
    if (!res.ok) {
      throw new Error(`[rsshub] fetch failed for ${target}: ${res.status} ${res.statusText}`);
    }
    return parseFeed(await res.text());
  }
}
