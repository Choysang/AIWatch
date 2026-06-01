import type { ConnectorType } from "@/connectors/types";
import type { Platform } from "@/scoring/types";

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
const RSSHUB_PLATFORM_ROUTES: Partial<Record<Platform, (value: string) => string | null>> = {
  x: xProfileRouteFromUrl,
};
const RESERVED_X_PATHS = new Set([
  "home",
  "explore",
  "i",
  "intent",
  "messages",
  "notifications",
  "search",
  "settings",
  "share",
]);

function routeFromHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return `/twitter/user/${handle}`;
}

/** Convert an X/Twitter profile homepage or @handle into the RSSHub route we monitor. */
export function xProfileRouteFromUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("@")) return routeFromHandle(raw);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return routeFromHandle(raw);
  }
  if (!X_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  const handle = parts[0]!;
  if (RESERVED_X_PATHS.has(handle.toLowerCase())) return null;
  return routeFromHandle(handle);
}

export interface DeriveConnectorRefInput {
  platform: Platform;
  connectorType?: ConnectorType | null;
  url?: string | null;
  handle?: string | null;
  connectorRef?: string | null;
}

export interface DeriveConnectorInput {
  platform: Platform;
  url?: string | null;
  handle?: string | null;
  connectorType?: ConnectorType | null;
  connectorRef?: string | null;
}

export interface DerivedConnector {
  connectorType: ConnectorType;
  connectorRef: string | null;
}

/** Fill connectorRef from operator-friendly source fields when possible. */
export function deriveConnectorRef(input: DeriveConnectorRefInput): string | null {
  const explicit = input.connectorRef?.trim();
  if (explicit) return explicit;
  if (input.platform === "x" && input.connectorType === "rsshub") {
    return xProfileRouteFromUrl(input.url) ?? xProfileRouteFromUrl(input.handle);
  }
  return null;
}

function looksLikeRssUrl(value: string | null | undefined): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.endsWith(".xml") ||
    raw.endsWith(".rss") ||
    raw.includes("/rss") ||
    raw.includes("/feed") ||
    raw.includes("feed.xml") ||
    raw.includes("atom.xml")
  );
}

/** Choose connector code from operator-facing fields. This keeps the admin form focused on
 *  the source homepage instead of internal connector details. */
export function deriveConnector(input: DeriveConnectorInput): DerivedConnector {
  const explicitType = input.connectorType ?? undefined;
  if (explicitType) {
    return {
      connectorType: explicitType,
      connectorRef: deriveConnectorRef({ ...input, connectorType: explicitType }),
    };
  }

  const routeBuilder = RSSHUB_PLATFORM_ROUTES[input.platform];
  const route = routeBuilder?.(input.url ?? "") ?? routeBuilder?.(input.handle ?? "");
  if (route) {
    return { connectorType: "rsshub", connectorRef: route };
  }
  if (input.platform === "rss" || looksLikeRssUrl(input.url)) {
    return { connectorType: "rss", connectorRef: input.url?.trim() || null };
  }
  return { connectorType: "manual", connectorRef: null };
}
