// Integration test for routing-override persistence (v0.5 C1.1) against real Postgres:
// upsert / list / load / delete, and the end-to-end path DB -> cache -> getRouteConfig.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let q: typeof import("@/db/queries/routing-overrides");
let cache: typeof import("@/llm/routing-overrides");
let getRouteConfig: typeof import("@/llm/routing").getRouteConfig;

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
  q = await import("@/db/queries/routing-overrides");
  cache = await import("@/llm/routing-overrides");
  ({ getRouteConfig } = await import("@/llm/routing"));
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

afterEach(async () => {
  await getDb().delete(schema.llmRoutingOverrides);
  cache.clearRoutingOverridesCache();
});

describe("routing override persistence", () => {
  test("upsert -> list + load", async () => {
    await q.upsertRoutingOverride("prefilter", "openai", "gpt-4.1-mini", "usr_a");
    const rows = await q.listRoutingOverrides();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.task).toBe("prefilter");
    expect(rows[0]?.provider).toBe("openai");

    const map = await q.loadRoutingOverrides();
    expect(map.get("prefilter")).toEqual({ provider: "openai", model: "gpt-4.1-mini" });
  });

  test("DB override flows into getRouteConfig via the cache", async () => {
    await q.upsertRoutingOverride("prefilter", "openai", "gpt-4.1-mini", null);
    cache.setRoutingOverrides(await q.loadRoutingOverrides());
    const route = getRouteConfig("prefilter");
    expect(route.provider).toBe("openai");
    expect(route.model).toBe("gpt-4.1-mini");
  });

  test("upsert on the same task updates in place", async () => {
    await q.upsertRoutingOverride("prefilter", "openai", "gpt-4.1-mini", null);
    await q.upsertRoutingOverride("prefilter", "deepseek", "deepseek-chat", null);
    const rows = await q.listRoutingOverrides();
    expect(rows).toHaveLength(1);
    expect((await q.loadRoutingOverrides()).get("prefilter")).toEqual({ provider: "deepseek", model: "deepseek-chat" });
  });

  test("delete removes the override", async () => {
    await q.upsertRoutingOverride("prefilter", "openai", "gpt-4.1-mini", null);
    await q.deleteRoutingOverride("prefilter");
    expect((await q.loadRoutingOverrides()).size).toBe(0);
  });
});
