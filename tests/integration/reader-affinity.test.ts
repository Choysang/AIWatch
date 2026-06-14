// Integration test for the reader-signal loader (v0.5 A3.1) against real Postgres: seed a
// reader's reactions + views joined to event dims, then assert loadReaderSignals returns the
// weighted signals + downed ids, and that feeding them through buildReaderAffinityProfile
// produces the expected like/down affinity end-to-end.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let loadReaderSignals: typeof import("@/db/queries/reader-affinity").loadReaderSignals;
let buildReaderAffinityProfile: typeof import("@/scoring/reader-affinity").buildReaderAffinityProfile;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

const FP_R = { userId: null, fingerprint: "fp_r" };
const FP_OTHER = { userId: null, fingerprint: "fp_other" };

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ loadReaderSignals } = await import("@/db/queries/reader-affinity"));
  ({ buildReaderAffinityProfile } = await import("@/scoring/reader-affinity"));
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

describe("loadReaderSignals", () => {
  test("returns the reader's weighted signals + downed ids, joined to event dims", async () => {
    await getDb()
      .insert(schema.events)
      .values([
        { id: "evt1", title: "ml release", tags: ["ml", "agent"], mainSourceId: "src_a", category: "research", contentType: "release" },
        { id: "evt2", title: "crypto noise", tags: ["crypto"], category: "news", contentType: "news" },
      ]);
    await getDb().insert(schema.eventReactions).values([
      { id: "rx1", eventId: "evt1", kind: "star", fingerprint: "fp_r" },
      { id: "rx2", eventId: "evt2", kind: "down", fingerprint: "fp_r" },
    ]);
    await getDb().insert(schema.eventViews).values([{ id: "vw1", eventId: "evt1", fingerprint: "fp_r" }]);

    const { signals, downedEventIds } = await loadReaderSignals(FP_R);
    expect(signals).toHaveLength(3); // star + down + view
    expect(downedEventIds).toEqual(["evt2"]);

    const star = signals.find((s) => s.signal === "star");
    expect(star?.tags).toContain("ml");
    expect(star?.category).toBe("research");
    expect(signals.some((s) => s.signal === "view")).toBe(true);

    // End-to-end through the model: liked tag positive, downed tag negative.
    const profile = buildReaderAffinityProfile(signals);
    expect(profile.tag.get("ml")?.affinity ?? 0).toBeGreaterThan(0);
    expect(profile.tag.get("crypto")?.affinity ?? 0).toBeLessThan(0);
  });

  test("is scoped to the identity — a different reader sees nothing", async () => {
    await getDb().insert(schema.events).values({ id: "evt1", title: "x", tags: ["ml"] });
    await getDb().insert(schema.eventReactions).values({ id: "rx1", eventId: "evt1", kind: "like", fingerprint: "fp_r" });

    const other = await loadReaderSignals(FP_OTHER);
    expect(other.signals).toHaveLength(0);
    expect(other.downedEventIds).toHaveLength(0);
  });

  test("an empty identity yields no signals", async () => {
    const empty = await loadReaderSignals({ userId: null, fingerprint: null });
    expect(empty.signals).toHaveLength(0);
  });
});
