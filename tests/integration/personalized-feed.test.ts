// Integration test for the board-driven 推荐 feed (v0.5 B) against real Postgres. 推荐 is just
// the reader's board interest (tags ∪ sources) applied to the normal feed in strict time order
// — no behavioral re-ranking. This exercises the `interests` OR predicate in searchEvents.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let searchEvents: typeof import("@/db/queries/feed").searchEvents;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

const NOW = new Date("2026-06-14T12:00:00Z");
const H = 60 * 60 * 1000;
const BASE = { mode: "all" as const, since: "all" as const };

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ searchEvents } = await import("@/db/queries/feed"));
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values([
      { id: "src_a", name: "A", platform: "blog", level: "L1", sourceType: "official", connectorType: "mock" },
      { id: "src_b", name: "B", platform: "blog", level: "L1", sourceType: "official", connectorType: "mock" },
    ])
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

async function seedEvents() {
  // Time order (newest first): neutral (src_b), crypto (src_a), ml (src_a).
  await getDb()
    .insert(schema.events)
    .values([
      { id: "evt_ml", title: "ml release", tags: ["ml"], mainSourceId: "src_a", publishedAt: new Date(NOW.getTime() - 3 * H) },
      { id: "evt_crypto", title: "crypto noise", tags: ["crypto"], mainSourceId: "src_a", publishedAt: new Date(NOW.getTime() - 2 * H) },
      { id: "evt_neutral", title: "neutral", tags: ["other"], mainSourceId: "src_b", publishedAt: new Date(NOW.getTime() - 1 * H) },
    ]);
}

describe("board interest feed (推荐)", () => {
  test("scopes to a tag interest, in strict time order", async () => {
    await seedEvents();
    const byTag = await searchEvents({ ...BASE, interests: { tags: ["ml"], sourceIds: [] } }, 10, NOW);
    expect(byTag.map((e) => e.id)).toEqual(["evt_ml"]);
  });

  test("scopes to a source interest, in strict time order", async () => {
    await seedEvents();
    // src_a carries crypto + ml (not neutral); newest-first => crypto before ml.
    const bySource = await searchEvents({ ...BASE, interests: { tags: [], sourceIds: ["src_a"] } }, 10, NOW);
    expect(bySource.map((e) => e.id)).toEqual(["evt_crypto", "evt_ml"]);
  });

  test("tags OR sources is a union, not an intersection", async () => {
    await seedEvents();
    // tag "other" (neutral) OR source src_a (crypto, ml) => all three, newest-first.
    const union = await searchEvents(
      { ...BASE, interests: { tags: ["other"], sourceIds: ["src_a"] } },
      10,
      NOW,
    );
    expect(union.map((e) => e.id)).toEqual(["evt_neutral", "evt_crypto", "evt_ml"]);
  });
});
