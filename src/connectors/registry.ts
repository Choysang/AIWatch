// Connector registry: maps a source's connector_type to a code connector.
// Wired: mock + rss + rsshub (hard tier). Remaining hard-tier types (reddit/github/...)
// land in later slices and fail closed with a clear message until implemented.

import { ManualConnector } from "./manual";
import { MockConnector } from "./mock";
import { RssConnector } from "./rss";
import { RsshubConnector } from "./rsshub";
import type { ConnectorType, SourceConnector } from "./types";

const registry: Partial<Record<ConnectorType, SourceConnector>> = {
  mock: new MockConnector(),
  rss: new RssConnector(),
  // RSSHub reads RSSHUB_BASE_URL lazily at fetch time, so a single shared instance is fine;
  // it fails closed (per source) when the base URL is unset.
  rsshub: new RsshubConnector(),
  // Hand-curated sources: fetch -> [] so the scheduled crawl never fabricates content.
  manual: new ManualConnector(),
};

export function getConnector(type: ConnectorType): SourceConnector {
  const connector = registry[type];
  if (!connector) {
    throw new Error(
      `[connectors] no connector for "${type}" yet (fail closed; implemented in a later slice)`,
    );
  }
  return connector;
}

export function hasConnector(type: ConnectorType): boolean {
  return Boolean(registry[type]);
}
