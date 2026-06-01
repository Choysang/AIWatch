// Integration test for the content_type backfill (SP2). Verifies it classifies only legacy
// rows (content_type IS NULL), leaves already-classified rows alone, and fails closed when
// the classifier signals an exhausted budget.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { isNull } from "drizzle-orm";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let backfill: typeof import("@/pipeline/backfill-content-type");

const SOURCE_ID = "src_bf";

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    pgHandle = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pgHandle.connectionString;
  }
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  backfill = await import("@/pipeline/backfill-content-type");

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
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.events);
});

async function insert(id: string, title: string, contentType: "model_release" | null): Promise<void> {
  await getDb().insert(schema.events).values({
    id,
    title,
    mainSourceId: SOURCE_ID,
    qualityScore: 70,
    contentType,
  });
}

describe("backfillContentType (real Postgres)", () => {
  test("classifies only NULL rows and leaves classified rows untouched", async () => {
    await insert("e_null_a", "DeepSeek V3 权重发布", null);
    await insert("e_null_b", "关于 scaling law 的讨论", null);
    await insert("e_done", "已分类", "model_release");

    // Deterministic stub classifier: title-keyword based.
    const classify = async (e: { title: string }) =>
      e.title.includes("讨论") ? ("discussion" as const) : ("model_release" as const);

    const summary = await backfill.backfillContentType({ db: getDb(), classify });
    expect(summary.scanned).toBe(2); // only the two NULL rows
    expect(summary.classified).toBe(2);
    expect(summary.failed).toBe(0);

    const remaining = await getDb()
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(isNull(schema.events.contentType));
    expect(remaining).toHaveLength(0);

    const byId = new Map(
      (
        await getDb()
          .select({ id: schema.events.id, ct: schema.events.contentType })
          .from(schema.events)
      ).map((r) => [r.id, r.ct]),
    );
    expect(byId.get("e_null_a")).toBe("model_release");
    expect(byId.get("e_null_b")).toBe("discussion");
    expect(byId.get("e_done")).toBe("model_release"); // unchanged
  });

  test("fails closed and stops when the classifier reports an exhausted budget", async () => {
    await insert("e1", "t1", null);
    await insert("e2", "t2", null);

    const classify = async () => {
      throw new backfill.BudgetExceededError("exhausted");
    };

    const summary = await backfill.backfillContentType({ db: getDb(), classify });
    expect(summary.budgetStopped).toBe(true);
    expect(summary.classified).toBe(0);
    // Stopped on the first row; nothing was written.
    const remaining = await getDb()
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(isNull(schema.events.contentType));
    expect(remaining).toHaveLength(2);
  });
});
