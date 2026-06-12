// ManualConnector: the connector for hand-curated sources (Task 3). There is nothing to
// auto-fetch — an operator enters posts by hand (admin manual-entry runs processSource
// directly). Returning [] makes the scheduled crawl a harmless no-op: the source can stay
// `enabled` (so it shows as healthy in admin) without the cron ever inventing content.

import type { ConnectorSource, RawPost, SourceConnector } from "./types";

export class ManualConnector implements SourceConnector {
  readonly type = "manual" as const;

  async fetch(_source: ConnectorSource): Promise<RawPost[]> {
    return [];
  }
}
