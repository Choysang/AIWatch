// Integration test for the B/A/S promotion job against real Postgres (decision H).
// Inserts synthetic scored events with controlled score/age, runs checkPromotion, and
// asserts tier assignment, slot limits, window gating, no-downgrade, idempotency, and
// the explainable selected_breakdown provenance.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let checkPromotion: typeof import("@/db/jobs/check-promotion").checkPromotion;
let scoringConfig: typeof import("@/scoring/config").scoringConfig;

const SOURCE_ID = "src_promo";
const NOW = new Date("2026-05-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

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
  ({ checkPromotion } = await import("@/db/jobs/check-promotion"));
  ({ scoringConfig } = await import("@/scoring/config"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "Promo Source",
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
  // Only clear the env we set, so other test files boot their own embedded pg and a
  // CI-provided DATABASE_URL is left intact.
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  // Isolate each scenario: the job scans all in-window events, so clear between tests.
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
});

async function insertScoredEvent(opts: {
  id: string;
  baseScore: number;
  publishedAt: Date;
  level?: "none" | "B" | "A" | "S";
}): Promise<void> {
  const { id, baseScore, publishedAt, level = "none" } = opts;
  const jId = `ej_${id}`;
  const sId = `es_${id}`;
  await getDb().insert(schema.events).values({
    id,
    title: id,
    mainSourceId: SOURCE_ID,
    publishedAt,
    selectedLevel: level,
  });
  await getDb().insert(schema.eventJudgments).values({
    id: jId,
    eventId: id,
    provider: "stub",
    modelId: "stub",
    promptVersion: "p",
    routingConfigVersion: "r",
    aiRelevance: 80,
    impact: 70,
    novelty: 60,
    audienceUsefulness: 65,
    evidenceClarity: 75,
  });
  await getDb().insert(schema.eventScores).values({
    id: sId,
    eventId: id,
    scoringConfigVersion: "scoring-v1",
    judgmentId: jId,
    baseScore,
    qualityScore: baseScore,
    rankScore: baseScore,
    displayScore: Math.round(baseScore),
    breakdown: {},
  });
  await getDb()
    .update(schema.events)
    .set({ currentScoreId: sId, currentJudgmentId: jId })
    .where(eq(schema.events.id, id));
}

async function levelOf(id: string): Promise<string> {
  const rows = await getDb()
    .select({ level: schema.events.selectedLevel })
    .from(schema.events)
    .where(eq(schema.events.id, id));
  return rows[0]!.level;
}

const tight = () => ({
  ...scoringConfig,
  promotion: { ...scoringConfig.promotion, slots: { B: 2, A: 1, S: 1 } },
});

describe("checkPromotion (real Postgres)", () => {
  test("assigns S/A/B by threshold and window; rejects below-threshold and out-of-window", async () => {
    await insertScoredEvent({ id: "e_s", baseScore: 95, publishedAt: ago(2) });
    await insertScoredEvent({ id: "e_a", baseScore: 88, publishedAt: ago(2) });
    await insertScoredEvent({ id: "e_b", baseScore: 78, publishedAt: ago(0.5) });
    await insertScoredEvent({ id: "e_low", baseScore: 70, publishedAt: ago(0.2) });
    await insertScoredEvent({ id: "e_old", baseScore: 99, publishedAt: ago(40) });

    const result = await checkPromotion(NOW, getDb());

    expect(await levelOf("e_s")).toBe("S");
    expect(await levelOf("e_a")).toBe("A");
    expect(await levelOf("e_b")).toBe("B");
    expect(await levelOf("e_low")).toBe("none");
    expect(await levelOf("e_old")).toBe("none");
    expect(result.applied).toEqual({ S: 1, A: 1, B: 1 });
  });

  test("enforces slot limits and cascades overflow to the next tier", async () => {
    // 3 B-eligible (recent, 75..) with B slots = 2 -> top 2 by score become B, 1 misses.
    await insertScoredEvent({ id: "b_hi", baseScore: 80, publishedAt: ago(0.3) });
    await insertScoredEvent({ id: "b_mid", baseScore: 78, publishedAt: ago(0.3) });
    await insertScoredEvent({ id: "b_lo", baseScore: 76, publishedAt: ago(0.3) });

    await checkPromotion(NOW, getDb(), tight());

    expect(await levelOf("b_hi")).toBe("B");
    expect(await levelOf("b_mid")).toBe("B");
    expect(await levelOf("b_lo")).toBe("none");
  });

  test("S slot overflow cascades to A", async () => {
    // 2 S-eligible (>=94, recent) with S slots = 1 -> top is S, second cascades to A.
    await insertScoredEvent({ id: "s1", baseScore: 99, publishedAt: ago(1) });
    await insertScoredEvent({ id: "s2", baseScore: 96, publishedAt: ago(1) });

    await checkPromotion(NOW, getDb(), tight());

    expect(await levelOf("s1")).toBe("S");
    expect(await levelOf("s2")).toBe("A");
  });

  test("never downgrades an already-selected event", async () => {
    // Currently S, but now only B-eligible (score 76). Must stay S.
    await insertScoredEvent({ id: "keep_s", baseScore: 76, publishedAt: ago(0.3), level: "S" });
    await checkPromotion(NOW, getDb());
    expect(await levelOf("keep_s")).toBe("S");
  });

  test("is idempotent: level and promoted_at stable across runs", async () => {
    await insertScoredEvent({ id: "idem", baseScore: 95, publishedAt: ago(2) });

    await checkPromotion(NOW, getDb());
    const first = (
      await getDb()
        .select({ level: schema.events.selectedLevel, promotedAt: schema.events.promotedAt })
        .from(schema.events)
        .where(eq(schema.events.id, "idem"))
    )[0]!;

    await checkPromotion(new Date(NOW.getTime() + 60_000), getDb());
    const second = (
      await getDb()
        .select({ level: schema.events.selectedLevel, promotedAt: schema.events.promotedAt })
        .from(schema.events)
        .where(eq(schema.events.id, "idem"))
    )[0]!;

    expect(second.level).toBe("S");
    expect(second.level).toBe(first.level);
    expect(second.promotedAt?.getTime()).toBe(first.promotedAt?.getTime());
  });

  test("writes an explainable selected_breakdown with provenance", async () => {
    await insertScoredEvent({ id: "prov", baseScore: 95, publishedAt: ago(2) });
    await checkPromotion(NOW, getDb());

    const ev = (
      await getDb()
        .select({
          label: schema.events.selectedLabel,
          breakdown: schema.events.selectedBreakdown,
        })
        .from(schema.events)
        .where(eq(schema.events.id, "prov"))
    )[0]!;

    expect(ev.label).toBe("本月精选");
    const b = ev.breakdown as Record<string, unknown>;
    expect(b.promotionConfigVersion).toBe("promotion-v1");
    expect(b.level).toBe("S");
    expect(b.threshold).toBe(94);
    expect(b.rankInWindow).toBe(1);
  });
});
