// Source connectors (locked decision 8): `SourceConnector { fetch(source) }`.
// Every adapter normalizes its platform's payload into `RawPost[]`. Connector is
// CODE; a Source is DATA (a DB row). Kept db-free so the boundary stays clean.

import type { Platform, PublicMetrics } from "@/scoring/types";

// Mirrors db `connector_type` pgEnum. Duplicated intentionally to keep connectors
// decoupled from the Drizzle schema (connectors must not depend on db internals).
export type ConnectorType =
  | "rss"
  | "github"
  | "hn"
  | "youtube_rss"
  | "huggingface"
  | "reddit"
  | "rsshub"
  | "mock";

/** A raw item fetched from a source, before gate/dedup/judgment. */
export interface RawPost {
  /** Stable per-source external id (guid, sha, etc.) when the platform provides one. */
  externalId?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  url?: string | null;
  rawTitle?: string | null;
  rawContent?: string | null;
  media?: unknown;
  publicMetrics?: PublicMetrics | null;
  publishedAt?: Date | null;
}

/** The subset of a Source row a connector needs to fetch. */
export interface ConnectorSource {
  id: string;
  platform: Platform;
  connectorType: ConnectorType;
  /** url / handle / rsshub route — connector-specific target. */
  connectorRef: string | null;
  url: string | null;
  handle: string | null;
}

export interface SourceConnector {
  readonly type: ConnectorType;
  fetch(source: ConnectorSource): Promise<RawPost[]>;
}
