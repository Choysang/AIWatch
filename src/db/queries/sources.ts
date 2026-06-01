// Source queries: pick due sources for crawling, record crawl outcome with a basic
// circuit breaker, and list health for the admin console. Raw SQL is confined here
// (decision 4); business code never embeds SQL.

import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { ConnectorSource, ConnectorType } from "@/connectors/types";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB, type Tx } from "@/db/client";
import { sources } from "@/db/schema";
import type { Platform, SourceLevel } from "@/scoring/types";

const DEGRADE_AFTER = 5; // consecutive failures -> degraded + slower interval
const DISABLE_AFTER = 20; // consecutive failures -> auto-disable + admin flag

/** A due source carries the connector view plus metadata the pipeline needs. */
export type DueSource = ConnectorSource & {
  level: SourceLevel;
  onboardedAt?: Date | null;
};

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
      onboardedAt: sources.onboardedAt,
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
      onboardedAt: sources.onboardedAt,
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
  reviewSuggestedAt: Date | null;
  reviewReason: string | null;
}

// --- Source management (Task 3: manual onboarding + curated provenance) ---

export type SourceTypeValue =
  | "official" | "employee" | "expert" | "kol" | "media" | "community" | "open_source_project";

export interface CreateSourceInput {
  name: string;
  platform: Platform;
  sourceType: SourceTypeValue;
  level: SourceLevel;
  connectorType: ConnectorType;
  handle?: string | null;
  url?: string | null;
  connectorRef?: string | null;
  categories?: string[];
  // Curated provenance (田区 source-info card).
  brandTag?: string | null;
  recommendedBy?: string | null;
  recommendReason?: string | null;
  onboardedAt?: Date | null;
}

/** Create a source with curated provenance. Returns the new id. Manual sources default to
 *  onboardedAt = now so the 田区 card always has an 接入日期 even if the operator leaves it blank. */
export async function createSource(input: CreateSourceInput, db: DB = defaultDb): Promise<string> {
  const id = newId("src");
  await db.insert(sources).values({
    id,
    name: input.name,
    platform: input.platform,
    sourceType: input.sourceType,
    level: input.level,
    connectorType: input.connectorType,
    handle: input.handle ?? null,
    url: input.url ?? null,
    connectorRef: input.connectorRef ?? null,
    categories: input.categories ?? [],
    brandTag: input.brandTag ?? null,
    recommendedBy: input.recommendedBy ?? null,
    recommendReason: input.recommendReason ?? null,
    onboardedAt: input.onboardedAt ?? new Date(),
  });
  return id;
}

export interface ManagedSourceRow {
  id: string;
  name: string;
  platform: string;
  handle: string | null;
  url: string | null;
  level: string;
  sourceType: string;
  connectorType: string;
  connectorRef: string | null;
  categories: string[];
  brandTag: string | null;
  recommendedBy: string | null;
  recommendReason: string | null;
  onboardedAt: Date | null;
  enabled: boolean;
  healthStatus: string;
  lastError: string | null;
}

export interface ArchivedSourceRow {
  id: string;
  name: string;
  platform: string;
  connectorType: string;
  connectorRef: string | null;
}

/** Soft-delete sources from the management console. We archive instead of hard-deleting
 *  because posts/events keep foreign-key references to their originating source. */
export async function archiveSources(ids: string[], db: DB | Tx = defaultDb): Promise<ArchivedSourceRow[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, 100);
  if (uniqueIds.length === 0) return [];

  return db
    .update(sources)
    .set({
      enabled: false,
      archivedAt: sql`now()`,
      healthStatus: "disabled",
      nextFetchAt: null,
      updatedAt: sql`now()`,
    })
    .where(and(inArray(sources.id, uniqueIds), isNull(sources.archivedAt)))
    .returning({
      id: sources.id,
      name: sources.name,
      platform: sources.platform,
      connectorType: sources.connectorType,
      connectorRef: sources.connectorRef,
    });
}

/** Sources for the management console (curated fields + connector), newest onboarded first. */
export async function listManagedSources(db: DB = defaultDb): Promise<ManagedSourceRow[]> {
  return db
    .select({
      id: sources.id,
      name: sources.name,
      platform: sources.platform,
      handle: sources.handle,
      url: sources.url,
      level: sources.level,
      sourceType: sources.sourceType,
      connectorType: sources.connectorType,
      connectorRef: sources.connectorRef,
      categories: sources.categories,
      brandTag: sources.brandTag,
      recommendedBy: sources.recommendedBy,
      recommendReason: sources.recommendReason,
      onboardedAt: sources.onboardedAt,
      enabled: sources.enabled,
      healthStatus: sources.healthStatus,
      lastError: sources.lastError,
    })
    .from(sources)
    .where(isNull(sources.archivedAt))
    .orderBy(sql`${sources.onboardedAt} desc nulls last`, asc(sources.name));
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
      reviewSuggestedAt: sources.reviewSuggestedAt,
      reviewReason: sources.reviewReason,
    })
    .from(sources)
    .orderBy(asc(sources.name));
}
