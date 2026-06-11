import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sources } from "@/db/schema";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle;
let savedDatabaseUrl: string | undefined;
let savedRsshubBaseUrl: string | undefined;

let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let createSource: typeof import("@/db/queries/sources").createSource;
let listManagedSources: typeof import("@/db/queries/sources").listManagedSources;
let checkManagedSourcesFetchHealth: typeof import("@/sources/source-health-check").checkManagedSourcesFetchHealth;

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  savedRsshubBaseUrl = process.env.RSSHUB_BASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  delete process.env.RSSHUB_BASE_URL;

  ({ getDb, resetDb } = await import("@/db/client"));
  ({ createSource, listManagedSources } = await import("@/db/queries/sources"));
  ({ checkManagedSourcesFetchHealth } = await import("@/sources/source-health-check"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
  if (savedRsshubBaseUrl === undefined) delete process.env.RSSHUB_BASE_URL;
  else process.env.RSSHUB_BASE_URL = savedRsshubBaseUrl;
}, 60_000);

describe("source health check (real Postgres)", () => {
  test("records RSSHub fetch failure without advancing crawl schedule", async () => {
    const sourceId = await createSource({
      name: "Tencent Hy",
      platform: "x",
      sourceType: "official",
      level: "L1",
      connectorType: "rsshub",
      handle: "@TencentHunyuan",
      connectorRef: "/twitter/user/TencentHunyuan",
      brandTag: "腾讯混元",
      recommendedBy: "Choysun",
      recommendReason: "腾讯混元模型官方",
      onboardedAt: new Date("2026-06-05T00:00:00Z"),
    });

    await getDb()
      .update(sources)
      .set({
        nextFetchAt: new Date("2026-07-01T00:00:00Z"),
        failureCount: 7,
      })
      .where(eq(sources.id, sourceId));

    const checked = await checkManagedSourcesFetchHealth(await listManagedSources());
    const row = checked.find((item) => item.id === sourceId);
    expect(row?.healthStatus).toBe("degraded");
    expect(row?.lastError).toContain("RSSHUB_BASE_URL");

    const [stored] = await getDb()
      .select({
        healthStatus: sources.healthStatus,
        lastError: sources.lastError,
        nextFetchAt: sources.nextFetchAt,
        failureCount: sources.failureCount,
      })
      .from(sources)
      .where(eq(sources.id, sourceId));

    expect(stored?.healthStatus).toBe("degraded");
    expect(stored?.lastError).toContain("RSSHUB_BASE_URL");
    expect(stored?.nextFetchAt?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(stored?.failureCount).toBe(7);
  });
});
