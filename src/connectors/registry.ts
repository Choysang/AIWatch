// Connector registry: maps a source's connector_type to a code connector.
// Slice 0 wires mock + rss. Hard-tier (rsshub/reddit/github/...) land in later slices
// and fail closed with a clear message until implemented.

import { MockConnector } from "./mock";
import { RssConnector } from "./rss";
import type { ConnectorType, SourceConnector } from "./types";

const registry: Partial<Record<ConnectorType, SourceConnector>> = {
  mock: new MockConnector(),
  rss: new RssConnector(),
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
