// Integration tests for the Scoring Integrity slice (Phase B):
//   - recomputePromotionScores: signal loading + compose + event_scores append + events update
//   - directPushEvent: stamps flag, writes audit row, idempotent
//   - checkPromotion with direct-push bypass + promotion_score-driven A/S tiers

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let recompute: typeof import("@/db/jobs/recompute-promotion-scores").recomputePromotionScores;
let directPush: typeof import("@/db/jobs/direct-push").directPushEvent;
let DirectPushForbiddenError: typeof import("@/db/jobs/direct-push").DirectPushForbiddenError;
let checkPromotion: typeof import("@/db/jobs/check-promotion").checkPromotion;

const SOURCE_ID = "src_scoring_int";
const NOW = new Date("2026-05-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

async function expectRejection(
  p: Promise<unknown>,
  type: new (...args: never[]) => Error,
): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(type);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    pgHandle = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pgHandle.connectionString;
  }
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ recomputePromotionScores: recompute } = await import("@/db/jobs/recompute-promotion-scores"));
  const directModule = await import("@/db/jobs/direct-push");
  directPush = directModule.directPushEvent;
  DirectPushForbiddenError = directModule.DirectPushForbiddenError;
  ({ checkPromotion } = await import("@/db/jobs/check-promotion"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "Scoring Integrity Source",
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
  await getDb().delete(schema.auditLogs);
  await getDb().delete(schema.eventComments);
  await getDb().delete(schema.eventReactions);
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.user);
});

async function seedScoredEvent(opts: {
  id: string;
  baseScore: number;
  publishedAt?: Date;
  category?: string;
  level?: "none" | "B" | "A" | "S";
}): Promise<void> {
  const publishedAt = opts.publishedAt ?? ago(0.5);
  const jId = `ej_${opts.id}`;
  const sId = `es_${opts.id}`;
  await getDb().insert(schema.events).values({
    id: opts.id,
    title: opts.id,
    category: opts.category ?? null,
    mainSourceId: SOURCE_ID,
    publishedAt,
    lastStrongSignalAt: publishedAt,
    selectedLevel: opts.level ?? "none",
  });
  await getDb().insert(schema.eventJudgments).values({
    id: jId,
    eventId: opts.id,
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
    eventId: opts.id,
    scoringConfigVersion: "scoring-v1",
    judgmentId: jId,
    baseScore: opts.baseScore,
    qualityScore: opts.baseScore,
    rankScore: opts.baseScore,
    displayScore: Math.round(opts.baseScore),
    breakdown: {},
  });
  await getDb()
    .update(schema.events)
    .set({ currentScoreId: sId, currentJudgmentId: jId })
    .where(eq(schema.events.id, opts.id));
}

async function seedExpertUser(opts: {
  id: string;
  role: "expert" | "moderator" | "admin" | "user";
  weight?: number;
  domains?: string[];
}): Promise<string> {
  await getDb().insert(schema.user).values({
    id: opts.id,
    name: opts.id,
    email: `${opts.id}@example.com`,
    emailVerified: true,
    role: opts.role,
    expertWeight: opts.weight ?? 1,
    expertDomain: opts.domains ?? [],
    createdAt: ago(30),
    updatedAt: ago(30),
  });
  return opts.id;
}

describe("recomputePromotionScores (real Postgres)", () => {
  test("cold event (no signals) gets neutral aggregates and persists peak_score", async () => {
    await seedScoredEvent({ id: "cold", baseScore: 80 });

    const result = await recompute(NOW, getDb());
    expect(result.candidates).toBe(1);
    expect(result.recomputed).toBe(1);

    const ev = (
      await getDb()
        .select({ peakScore: schema.events.peakScore, qualityScore: schema.events.qualityScore })
        .from(schema.events)
        .where(eq(schema.events.id, "cold"))
    )[0]!;
    // promotion_score = 80*0.55 + 50*0.20 + 50*0.15 + 50*0.10 = 66.5
    expect(ev.peakScore).toBeCloseTo(66.5, 1);
    // Cold event with level=none -> displayScore = qualityScore (handled by display-score:
    // level=none short-circuits to qualityScore). Quality_score for a fresh recompute is
    // the new display_score, which for cold equals the rounded promotion_score.
    expect(ev.qualityScore).toBe(67);
  });

  test("expert star raises promotion_score above cold baseline", async () => {
    await seedExpertUser({ id: "u_expert", role: "expert", weight: 1.5, domains: ["llm"] });
    await seedScoredEvent({ id: "warm", baseScore: 80, category: "llm" });

    await getDb().insert(schema.eventReactions).values({
      id: "rx_1",
      eventId: "warm",
      kind: "star",
      userId: "u_expert",
    });

    await recompute(NOW, getDb());

    const ev = (
      await getDb()
        .select({ peakScore: schema.events.peakScore })
        .from(schema.events)
        .where(eq(schema.events.id, "warm"))
    )[0]!;
    // Domain-matched expert star is real signal -> promotion_score > cold 66.5.
    expect(ev.peakScore).toBeGreaterThan(66.5);
  });

  test("non-expert reactions do not move promotion_score above cold baseline", async () => {
    await seedExpertUser({ id: "u_reader", role: "user" });
    await seedScoredEvent({ id: "reader_only", baseScore: 80 });

    await getDb().insert(schema.eventReactions).values({
      id: "rx_r",
      eventId: "reader_only",
      kind: "star",
      userId: "u_reader",
    });

    await recompute(NOW, getDb());
    const ev = (
      await getDb()
        .select({ peakScore: schema.events.peakScore })
        .from(schema.events)
        .where(eq(schema.events.id, "reader_only"))
    )[0]!;
    expect(ev.peakScore).toBeCloseTo(66.5, 1);
  });

  test("peak_score ratchets upward only (no decay on the persisted peak)", async () => {
    await seedScoredEvent({ id: "ratchet", baseScore: 80 });
    // Pre-stamp a high prior peak; new compute produces 66.5 < 92 -> peak stays at 92.
    await getDb()
      .update(schema.events)
      .set({ peakScore: 92 })
      .where(eq(schema.events.id, "ratchet"));

    await recompute(NOW, getDb());

    const ev = (
      await getDb()
        .select({ peakScore: schema.events.peakScore })
        .from(schema.events)
        .where(eq(schema.events.id, "ratchet"))
    )[0]!;
    expect(ev.peakScore).toBe(92);
  });

  test("appends a new event_scores row per recompute (append-only history)", async () => {
    await seedScoredEvent({ id: "history", baseScore: 80 });
    await recompute(NOW, getDb());
    await recompute(new Date(NOW.getTime() + 60_000), getDb());

    const rows = await getDb()
      .select({ id: schema.eventScores.id })
      .from(schema.eventScores)
      .where(eq(schema.eventScores.eventId, "history"));
    expect(rows.length).toBeGreaterThanOrEqual(3); // initial + 2 recomputes
  });
});

describe("directPushEvent (real Postgres)", () => {
  test("stamps flag, writes audit row, re-arms last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "to_push", baseScore: 60 });

    const r = await directPush(
      "to_push",
      { id: "u_admin", role: "admin" },
      "promoting clearly important item",
    );
    expect(r.alreadyPushed).toBe(false);

    const ev = (
      await getDb()
        .select({
          pushAt: schema.events.expertDirectPushAt,
          pushBy: schema.events.expertDirectPushBy,
          lastSig: schema.events.lastStrongSignalAt,
        })
        .from(schema.events)
        .where(eq(schema.events.id, "to_push"))
    )[0]!;
    expect(ev.pushAt).not.toBeNull();
    expect(ev.pushBy).toBe("u_admin");
    expect(ev.lastSig).not.toBeNull();

    const audits = await getDb()
      .select({ action: schema.auditLogs.action, actorId: schema.auditLogs.actorId })
      .from(schema.auditLogs);
    expect(audits.some((a) => a.action === "event.directPush" && a.actorId === "u_admin")).toBe(true);
  });

  test("is idempotent: re-pushing returns alreadyPushed without extra audit", async () => {
    await seedScoredEvent({ id: "idempot", baseScore: 60 });

    await directPush("idempot", { id: "u_admin", role: "admin" }, undefined);
    const r2 = await directPush("idempot", { id: "u_admin", role: "admin" }, undefined);
    expect(r2.alreadyPushed).toBe(true);

    const audits = await getDb()
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs);
    expect(audits.length).toBe(1);
  });

  test("rejects callers without event.directPush capability", async () => {
    await seedScoredEvent({ id: "guarded", baseScore: 60 });
    await expectRejection(
      directPush("guarded", { id: "u_reader", role: "user" }, undefined),
      DirectPushForbiddenError,
    );
    const ev = (
      await getDb()
        .select({ pushAt: schema.events.expertDirectPushAt })
        .from(schema.events)
        .where(eq(schema.events.id, "guarded"))
    )[0]!;
    expect(ev.pushAt).toBeNull();
  });
});

describe("checkPromotion + direct-push (real Postgres)", () => {
  test("direct-pushed event with low base_score is promoted to B", async () => {
    await seedScoredEvent({ id: "low_score", baseScore: 60, publishedAt: ago(0.3) });
    await directPush("low_score", { id: "u_admin", role: "admin" }, undefined);

    await checkPromotion(NOW, getDb());

    const ev = (
      await getDb()
        .select({ level: schema.events.selectedLevel, breakdown: schema.events.selectedBreakdown })
        .from(schema.events)
        .where(eq(schema.events.id, "low_score"))
    )[0]!;
    expect(ev.level).toBe("B");
    expect((ev.breakdown as Record<string, unknown>).directPushed).toBe(true);
  });

  test("A tier uses promotion_score, not raw base_score", async () => {
    // base 80 (B-eligible), but published 3d ago (outside B 24h window). After recompute
    // with strong expert signals, promotion_score climbs above the A threshold (86).
    await seedExpertUser({ id: "u_e1", role: "expert", weight: 1.5, domains: ["ai"] });
    await seedExpertUser({ id: "u_e2", role: "expert", weight: 1.5, domains: ["ai"] });
    await seedScoredEvent({
      id: "a_climb",
      // Need base high enough that 0.55*base + 0.20*100 + 0.15*50 + 0.10*~90 >= 86.
      // base=92 -> ~87.1.
      baseScore: 92,
      publishedAt: ago(3),
      category: "ai",
    });

    await getDb().insert(schema.eventReactions).values([
      { id: "rx_a1", eventId: "a_climb", kind: "star", userId: "u_e1" },
      { id: "rx_a2", eventId: "a_climb", kind: "star", userId: "u_e2" },
    ]);
    await getDb().insert(schema.eventComments).values([
      {
        id: "cmt_1",
        eventId: "a_climb",
        userId: "u_e1",
        body: "good",
        bodyHash: "h1",
        category: "praise",
        classification: "valid",
        isExpert: true,
      },
      {
        id: "cmt_2",
        eventId: "a_climb",
        userId: "u_e2",
        body: "useful",
        bodyHash: "h2",
        category: "handson",
        classification: "valid",
        isExpert: true,
      },
    ]);

    await recompute(NOW, getDb());
    await checkPromotion(NOW, getDb());

    const ev = (
      await getDb()
        .select({ level: schema.events.selectedLevel, breakdown: schema.events.selectedBreakdown })
        .from(schema.events)
        .where(eq(schema.events.id, "a_climb"))
    )[0]!;
    expect(ev.level).toBe("A");
    expect((ev.breakdown as Record<string, unknown>).promotionScore as number).toBeGreaterThanOrEqual(86);
  });
});
