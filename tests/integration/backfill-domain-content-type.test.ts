// Integration test for the dual-axis backfill. Verifies it reclassifies only rows whose domain is
// missing or non-canonical, stamps BOTH axes (category=domain + content_type), leaves canonical
// rows untouched, skips trash verdicts, and fails closed when the classifier reports an exhausted
// budget.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { isNull } from "drizzle-orm";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let backfill: typeof import("@/pipeline/backfill-domain-content-type");

const SOURCE_ID = "src_bfd";

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  backfill = await import("@/pipeline/backfill-domain-content-type");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "Src",
      platform: "blog",
      level: "L1",
      sourceType: "official",
      connectorType: "mock",
    })
    .onConflictDoNothing({ target: schema.sources.id });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.events);
});

async function insert(
  id: string,
  title: string,
  category: string | null,
  contentType: "release" | null,
): Promise<void> {
  await getDb().insert(schema.events).values({
    id,
    title,
    mainSourceId: SOURCE_ID,
    qualityScore: 70,
    category,
    contentType,
  });
}

describe("backfillDomainContentType (real Postgres)", () => {
  test("reclassifies null/legacy rows on both axes and leaves canonical rows untouched", async () => {
    await insert("e_null", "DeepSeek V3 权重发布", null, null);
    await insert("e_legacy", "关于 scaling law 的讨论", "Core_Research", "release"); // known legacy domain
    await insert("e_done", "已分类", "product", "release"); // canonical domain -> excluded

    // Deterministic stub classifier: title-keyword based, returns both axes.
    const classify = async (e: { title: string }) =>
      e.title.includes("发布")
        ? { domain: "product" as const, contentType: "release" as const }
        : { domain: "technology" as const, contentType: "research" as const };

    const summary = await backfill.backfillDomainContentType({ db: getDb(), classify });
    expect(summary.scanned).toBe(2); // e_null + e_legacy; e_done is canonical, excluded
    expect(summary.reclassified).toBe(2);
    expect(summary.skippedTrash).toBe(0);
    expect(summary.failed).toBe(0);

    const byId = new Map(
      (
        await getDb()
          .select({
            id: schema.events.id,
            cat: schema.events.category,
            ct: schema.events.contentType,
          })
          .from(schema.events)
      ).map((r) => [r.id, { cat: r.cat, ct: r.ct }]),
    );
    expect(byId.get("e_null")).toEqual({ cat: "product", ct: "release" });
    expect(byId.get("e_legacy")).toEqual({ cat: "technology", ct: "release" });
    expect(byId.get("e_done")).toEqual({ cat: "product", ct: "release" }); // unchanged
  });

  test("skips trash verdicts without writing", async () => {
    await insert("e_trash", "看似干货的软文推广", null, null);

    const classify = async () => ({ domain: "trash" as const, contentType: "opinion" as const });

    const summary = await backfill.backfillDomainContentType({ db: getDb(), classify });
    expect(summary.skippedTrash).toBe(1);
    expect(summary.reclassified).toBe(0);

    const rows = await getDb()
      .select({ cat: schema.events.category, ct: schema.events.contentType })
      .from(schema.events);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cat).toBeNull(); // untouched — left for human review
    expect(rows[0]?.ct).toBeNull();
  });

  test("fails closed and stops when the classifier reports an exhausted budget", async () => {
    await insert("e1", "t1", null, null);
    await insert("e2", "t2", null, null);

    const classify = async () => {
      throw new backfill.BudgetExceededError("exhausted");
    };

    const summary = await backfill.backfillDomainContentType({ db: getDb(), classify });
    expect(summary.budgetStopped).toBe(true);
    expect(summary.reclassified).toBe(0);
    // Stopped on the first row; nothing was written.
    const stillNull = await getDb()
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(isNull(schema.events.category));
    expect(stillNull).toHaveLength(2);
  });
});
