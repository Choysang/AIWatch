import { getConnector as defaultGetConnector } from "@/connectors/registry";
import type { ConnectorType, SourceConnector } from "@/connectors/types";
import {
  markSourceHealthCheckFailure,
  markSourceHealthCheckSuccess,
  type ManagedSourceRow,
} from "@/db/queries/sources";
import type { Platform } from "@/scoring/types";

interface SourceHealthCheckDeps {
  getConnector?: (type: ConnectorType) => SourceConnector;
  markHealthCheckSuccess?: (sourceId: string) => Promise<void>;
  markHealthCheckFailure?: (sourceId: string, error: string) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFetchable(row: ManagedSourceRow): boolean {
  return row.enabled && row.healthStatus !== "paused" && row.healthStatus !== "disabled";
}

export async function checkManagedSourceFetchHealth(
  row: ManagedSourceRow,
  deps: SourceHealthCheckDeps = {},
): Promise<ManagedSourceRow> {
  if (!isFetchable(row)) return row;

  const getConnector = deps.getConnector ?? defaultGetConnector;
  const markSuccess = deps.markHealthCheckSuccess ?? markSourceHealthCheckSuccess;
  const markFailure = deps.markHealthCheckFailure ?? markSourceHealthCheckFailure;

  try {
    const connector = getConnector(row.connectorType as ConnectorType);
    await connector.fetch({
      id: row.id,
      platform: row.platform as Platform,
      connectorType: row.connectorType as ConnectorType,
      connectorRef: row.connectorRef,
      url: row.url,
      handle: row.handle,
    });
    await markSuccess(row.id);
    return { ...row, healthStatus: "healthy", lastError: null };
  } catch (error) {
    const message = errorMessage(error).slice(0, 1000);
    await markFailure(row.id, message);
    return { ...row, healthStatus: "degraded", lastError: message };
  }
}

export async function checkManagedSourcesFetchHealth(
  rows: ManagedSourceRow[],
  deps: SourceHealthCheckDeps = {},
): Promise<ManagedSourceRow[]> {
  return Promise.all(rows.map((row) => checkManagedSourceFetchHealth(row, deps)));
}
