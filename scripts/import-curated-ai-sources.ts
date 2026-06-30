import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getConnector } from "@/connectors/registry";
import { db } from "@/db/client";
import {
  archiveSources,
  createSource,
  markSourceHealthCheckSuccess,
  markSourceImportFailure,
} from "@/db/queries/sources";
import { sources } from "@/db/schema";
import type { ConnectorType } from "@/connectors/types";
import type { SourceTypeValue } from "@/db/queries/sources";
import type { Platform, SourceLevel } from "@/scoring/types";

const DATA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "sources",
  "curated_ai_sources.json",
);

const sourceSchema = z.object({
  name: z.string().min(1),
  handle: z.string().nullable().optional(),
  url: z.string().url(),
  platform: z.enum(["x", "blog", "rss", "huggingface"]),
  connectorType: z.enum(["rsshub", "rss", "huggingface"]),
  connectorRef: z.string().min(1),
  category: z.enum(["official", "industry_leader", "technical_share"]),
  sourceType: z.enum(["official", "employee", "expert", "kol", "media", "community", "open_source_project"]),
  level: z.enum(["L1", "L2", "L3", "L4", "L5"]),
  ai_density_score: z.number().min(6).max(10),
  recommendedBy: z.string().min(1),
  recommendReason: z.string().min(1),
});

const sourcesSchema = z.array(sourceSchema).min(1);
type CuratedSource = z.infer<typeof sourceSchema>;
type CreatedSource = CuratedSource & { id: string };

function sourceKey(input: {
  connectorType: string;
  connectorRef?: string | null;
  url?: string | null;
  handle?: string | null;
  name?: string | null;
}): string {
  const target = input.connectorRef ?? input.url ?? input.handle ?? input.name ?? "";
  return `${input.connectorType}:${target}`.trim().toLowerCase();
}

function toCreateInput(source: CuratedSource) {
  return {
    name: source.name,
    platform: source.platform as Platform,
    sourceType: source.sourceType as SourceTypeValue,
    level: source.level as SourceLevel,
    connectorType: source.connectorType as ConnectorType,
    handle: source.handle ?? null,
    url: source.url,
    connectorRef: source.connectorRef,
    categories: [source.category],
    brandTag: source.name,
    recommendedBy: source.recommendedBy,
    recommendReason: source.recommendReason,
  };
}

async function loadSources(): Promise<CuratedSource[]> {
  const raw = await readFile(DATA_PATH, "utf8");
  return sourcesSchema.parse(JSON.parse(raw));
}

async function findExisting(source: CuratedSource): Promise<string | null> {
  const rows = await db
    .select({ id: sources.id, connectorType: sources.connectorType, connectorRef: sources.connectorRef })
    .from(sources)
    .where(eq(sources.connectorRef, source.connectorRef))
    .limit(5);
  const key = sourceKey(source);
  return rows.find((row) => sourceKey(row) === key)?.id ?? null;
}

async function archiveDuplicates(): Promise<number> {
  const rows = await db
    .select({
      id: sources.id,
      connectorType: sources.connectorType,
      connectorRef: sources.connectorRef,
      url: sources.url,
      handle: sources.handle,
      name: sources.name,
    })
    .from(sources)
    .where(isNull(sources.archivedAt))
    .orderBy(asc(sources.createdAt));

  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const row of rows) {
    const key = sourceKey(row);
    if (!key) continue;
    if (seen.has(key)) duplicateIds.push(row.id);
    else seen.add(key);
  }

  if (duplicateIds.length > 0) await archiveSources(duplicateIds, db);
  return duplicateIds.length;
}

async function archiveNonCurated(curatedKeys: Set<string>): Promise<number> {
  const rows = await db
    .select({
      id: sources.id,
      connectorType: sources.connectorType,
      connectorRef: sources.connectorRef,
      url: sources.url,
      handle: sources.handle,
      name: sources.name,
    })
    .from(sources)
    .where(isNull(sources.archivedAt));

  const ids = rows
    .filter((row) => row.connectorType !== "manual" && !curatedKeys.has(sourceKey(row)))
    .map((row) => row.id);

  if (ids.length > 0) await archiveSources(ids, db);
  return ids.length;
}


async function smokeTestCreatedSources(createdSources: CreatedSource[]): Promise<number> {
  let failed = 0;
  for (const source of createdSources) {
    try {
      const connector = getConnector(source.connectorType as ConnectorType);
      const posts = await connector.fetch({
        id: source.id,
        platform: source.platform as Platform,
        connectorType: source.connectorType as ConnectorType,
        connectorRef: source.connectorRef,
        url: source.url,
        handle: source.handle ?? null,
      });
      const latest = posts[0];
      if (!latest) {
        failed += 1;
        await markSourceImportFailure(source.id, "no_items", db);
        console.warn(`[curated-import:test] ${source.name} no_items`);
      } else {
        await markSourceHealthCheckSuccess(source.id, db);
        console.log(
          `[curated-import:test] ${source.name} ok items=${posts.length} latest=${JSON.stringify(latest.rawTitle ?? latest.url ?? latest.externalId ?? "untitled").slice(0, 160)}`,
        );
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await markSourceImportFailure(source.id, message, db);
      console.warn(`[curated-import:test] ${source.name} error=${message}`);
    }
  }
  return failed;
}
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const shouldArchiveNonCurated = process.argv.includes("--archive-non-curated");
  const curatedSources = await loadSources();
  const curatedKeys = new Set(curatedSources.map(sourceKey));
  let created = 0;
  let updated = 0;
  const createdSources: CreatedSource[] = [];

  for (const source of curatedSources) {
    const input = toCreateInput(source);
    const existingId = await findExisting(source);

    if (dryRun) {
      if (existingId) updated += 1;
      else created += 1;
      continue;
    }

    if (existingId) {
      await db
        .update(sources)
        .set({
          name: input.name,
          platform: input.platform,
          sourceType: input.sourceType,
          level: input.level,
          connectorType: input.connectorType,
          handle: input.handle,
          url: input.url,
          connectorRef: input.connectorRef,
          categories: input.categories,
          brandTag: input.brandTag,
          recommendedBy: input.recommendedBy,
          recommendReason: input.recommendReason,
          enabled: true,
          archivedAt: null,
          failureCount: 0,
          healthStatus: "healthy",
          lastError: null,
          nextFetchAt: null,
          updatedAt: new Date(),
        })
        .where(eq(sources.id, existingId));
      updated += 1;
    } else {
      const id = await createSource(input, db);
      createdSources.push({ ...source, id });
      created += 1;
    }
  }

  const createdTestFailures = dryRun ? 0 : await smokeTestCreatedSources(createdSources);
  const archivedDuplicates = dryRun ? 0 : await archiveDuplicates();
  const archivedNonCurated =
    dryRun || !shouldArchiveNonCurated ? 0 : await archiveNonCurated(curatedKeys);

  console.log(
    `[curated-import] total=${curatedSources.length} created=${created} updated=${updated} createdTestFailures=${createdTestFailures} archivedDuplicates=${archivedDuplicates} archivedNonCurated=${archivedNonCurated}${dryRun ? " dryRun=1" : ""}`,
  );
}

main().catch((error) => {
  console.error("[curated-import] failed:", error);
  process.exit(1);
});
