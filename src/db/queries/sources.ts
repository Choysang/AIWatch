// Source queries: pick due sources for crawling, record crawl outcome with a basic
// circuit breaker, and list health for the admin console. Raw SQL is confined here
// (decision 4); business code never embeds SQL.

import { and, asc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { ConnectorSource } from "@/connectors/types";
import { db as defaultDb, type DB } from "@/db/client";
import { sources } from "@/db/schema";
import type { SourceLevel } from "@/scoring/types";

const DEGRADE_AFTER = 5; // consecutive failures -> degraded + slower interval
const DISABLE_AFTER = 20; // consecutive failures -> auto-disable + admin flag

/** A due source carries the connector view plus the level the pipeline needs to score. */
export type DueSource = ConnectorSource & { level: SourceLevel };

/** Sources eligible to crawl now: enabled, not archived, not disabled, and due. */
export async function getDueSources(limit = 50, db: DB = defaultDb): Promise<DueSource[]> {
  const rows = await db
    .select({
      id: sources.id,
      platform: sources.platform,
      connectorType: sources.connectorType,
      connectorRef: sources.connectorRef,
      url: sources.url,
      handle: sources.handle,
      level: sources.level,
    })
    .from(sources)
    .where(
      and(
        eq(sources.enabled, true),
        isNull(sources.archivedAt),
        ne(sources.healthStatus, "disabled"),
        or(isNull(sources.nextFetchAt), lte(sources.nextFetchAt, sql`now()`)),
      ),
    )
    .orderBy(asc(sql`${sources.nextFetchAt} nulls first`))
    .limit(limit);
  return rows;
}

/** Load one source as a DueSource (used by the crawl task after dequeue). */
export async function getSourceById(id: string, db: DB = defaultDb): Promise<DueSource | null> {
  const rows = await db
    .select({
      id: sources.id,
      platform: sources.platform,
      connectorType: sources.connectorType,
      connectorRef: sources.connectorRef,
      url: sources.url,
      handle: sources.handle,
      level: sources.level,
    })
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function markSourceSuccess(sourceId: string, db: DB = defaultDb): Promise<void> {
  await db
    .update(sources)
    .set({
      lastFetchAt: sql`now()`,
      nextFetchAt: sql`now() + ${sources.fetchFrequency}`,
      failureCount: 0,
      healthStatus: "healthy",
      lastError: null,
      updatedAt: sql`now()`,
    })
    .where(eq(sources.id, sourceId));
}

export async function markSourceFailure(
  sourceId: string,
  error: string,
  db: DB = defaultDb,
): Promise<void> {
  // Circuit breaker: degrade (slow down) at 5, auto-disable at 20 consecutive failures.
  await db
    .update(sources)
    .set({
      lastFetchAt: sql`now()`,
      failureCount: sql`${sources.failureCount} + 1`,
      healthStatus: sql`case
        when ${sources.failureCount} + 1 >= ${DISABLE_AFTER} then 'disabled'::health_status
        when ${sources.failureCount} + 1 >= ${DEGRADE_AFTER} then 'degraded'::health_status
        else ${sources.healthStatus} end`,
      nextFetchAt: sql`case
        when ${sources.failureCount} + 1 >= ${DEGRADE_AFTER} then now() + ${sources.fetchFrequency} * 2
        else now() + ${sources.fetchFrequency} end`,
      lastError: error.slice(0, 1000),
      updatedAt: sql`now()`,
    })
    .where(eq(sources.id, sourceId));
}

export interface SourceHealthRow {
  id: string;
  name: string;
  platform: string;
  level: string;
  connectorType: string;
  enabled: boolean;
  healthStatus: string;
  lastFetchAt: Date | null;
  nextFetchAt: Date | null;
  failureCount: number;
  lastError: string | null;
}

export async function listSourceHealth(db: DB = defaultDb): Promise<SourceHealthRow[]> {
  return db
    .select({
      id: sources.id,
      name: sources.name,
      platform: sources.platform,
      level: sources.level,
      connectorType: sources.connectorType,
      enabled: sources.enabled,
      healthStatus: sources.healthStatus,
      lastFetchAt: sources.lastFetchAt,
      nextFetchAt: sources.nextFetchAt,
      failureCount: sources.failureCount,
      lastError: sources.lastError,
    })
    .from(sources)
    .orderBy(asc(sources.name));
}
