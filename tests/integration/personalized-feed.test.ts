// Integration test for the 推荐 (personalized) feed (v0.5 A3.2) against real Postgres.
// Seeds three recent events + one reader's signals, then asserts searchPersonalized boosts
// the liked-tag event above a higher-base neutral one (personalization overrides time),
// excludes downed events (P6), and falls back to recent order on a cold-start identity (P7).

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let searchPersonalized: typeof import("@/db/queries/feed").searchPersonalized;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

const NOW = new Date("2026-06-14T12:00:00Z");
const H = 60 * 60 * 1000;
const FP_R = { userId: null, fingerprint: "fp_r" };
const FP_COLD = { userId: null, fingerprint: "fp_cold" };
const FILTER = { mode: "personalized" as const, since: "all" as const };

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ searchPersonalized } = await import("@/db/queries/feed"));
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({ id: "src_a", name: "A", platform: "blog", level: "L1", sourceType: "official", connectorType: "mock" })
    .onConflictDoNothing({ target: schema.sources.id });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.eventReactions);
  await getDb().delete(schema.eventViews);
  await getDb().delete(schema.events);
});

async function seedEvents() {
  // evtNeutral newest + slightly higher base; evtMl oldest. Time order = neutral, crypto, ml.
  await getDb()
    .insert(schema.events)
    .values([
      { id: "evt_ml", title: "ml release", tags: ["ml"], mainSourceId: "src_a", qualityScore: 50, publishedAt: new Date(NOW.getTime() - 3 * H) },
      { id: "evt_crypto", title: "crypto noise", tags: ["crypto"], mainSourceId: "src_a", qualityScore: 50, publishedAt: new Date(NOW.getTime() - 2 * H) },
      { id: "evt_neutral", title: "neutral", tags: ["other"], mainSourceId: "src_a", qualityScore: 55, publishedAt: new Date(NOW.getTime() - 1 * H) },
    ]);
}

describe("searchPersonalized", () => {
  test("boosts a liked-tag event above a higher-base neutral one and drops downed events", async () => {
    await seedEvents();
    await getDb().insert(schema.eventReactions).values([
      { id: "rx1", eventId: "evt_ml", kind: "star", fingerprint: "fp_r" },
      { id: "rx2", eventId: "evt_crypto", kind: "down", fingerprint: "fp_r" },
    ]);

    const result = await searchPersonalized(FP_R, FILTER, 10, NOW);
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain("evt_crypto"); // downed -> excluded (P6)
    expect(ids[0]).toBe("evt_ml"); // boosted to the top despite being the oldest + lower base
    expect(ids).toContain("evt_neutral");
  });

  test("cold-start identity (no signals) falls back to recent time order", async () => {
    await seedEvents();
    const result = await searchPersonalized(FP_COLD, FILTER, 10, NOW);
    expect(result.map((e) => e.id)).toEqual(["evt_neutral", "evt_crypto", "evt_ml"]);
  });

  test("board interests scope the pool to matching tags OR sources (v0.5 B)", async () => {
    await seedEvents();
    // Interest by tag: only the ml event carries the "ml" tag.
    const byTag = await searchPersonalized(
      FP_COLD,
      { ...FILTER, interests: { tags: ["ml"], sourceIds: [] } },
      10,
      NOW,
    );
    expect(byTag.map((e) => e.id)).toEqual(["evt_ml"]);

    // Interest by source: all three share src_a → all qualify (cold start = time order).
    const bySource = await searchPersonalized(
      FP_COLD,
      { ...FILTER, interests: { tags: [], sourceIds: ["src_a"] } },
      10,
      NOW,
    );
    expect(bySource.map((e) => e.id)).toEqual(["evt_neutral", "evt_crypto", "evt_ml"]);

    // OR union: tag "ml" OR source src_a → all three (src_a matches every seeded event).
    const union = await searchPersonalized(
      FP_COLD,
      { ...FILTER, interests: { tags: ["ml"], sourceIds: ["src_a"] } },
      10,
      NOW,
    );
    expect(new Set(union.map((e) => e.id))).toEqual(new Set(["evt_ml", "evt_crypto", "evt_neutral"]));
  });
});
