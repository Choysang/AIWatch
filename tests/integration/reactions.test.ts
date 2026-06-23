// Integration test for the Slice 7 user-feedback path (likes + stars + rank-score) against
// real Postgres. Exercises: add/remove idempotency, denormalized count parity, the partial
// unique indexes (per-identity), the identity-XOR CHECK, and the SQL recompute job's
// parity with the pure rank-score module.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let reactions: typeof import("@/db/queries/reactions");
let recompute: typeof import("@/db/jobs/recompute-rank-scores");
let rankScore: typeof import("@/scoring/rank-score");
let annotations: typeof import("@/db/queries/owner-annotations");
let ownerAffinity: typeof import("@/scoring/owner-affinity");

const NOW = new Date("2026-05-26T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

async function expectRejection(
  p: Promise<unknown>,
  type: new (...args: never[]) => Error = Error,
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
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  reactions = await import("@/db/queries/reactions");
  recompute = await import("@/db/jobs/recompute-rank-scores");
  rankScore = await import("@/scoring/rank-score");
  annotations = await import("@/db/queries/owner-annotations");
  ownerAffinity = await import("@/scoring/owner-affinity");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.ownerAnnotations);
  await getDb().delete(schema.eventReactions);
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.posts);
  await getDb().delete(schema.sources);
});

async function seedSource(id = "src_test"): Promise<string> {
  await getDb().insert(schema.sources).values({
    id,
    name: id,
    platform: "blog",
    level: "L2",
    sourceType: "official",
    connectorType: "mock",
  });
  return id;
}

async function seedJudgment(eventId: string): Promise<string> {
  const id = `ej_${eventId}`;
  await getDb().insert(schema.eventJudgments).values({
    id,
    eventId,
    provider: "stub",
    modelId: "stub",
    promptVersion: "v1",
    routingConfigVersion: "v1",
    aiRelevance: 80,
    impact: 80,
    novelty: 80,
    audienceUsefulness: 80,
    evidenceClarity: 80,
  });
  return id;
}

async function seedEvent(opts: {
  id: string;
  sourceId: string;
  publishedAt: Date;
  baseScore: number;
}): Promise<void> {
  await getDb().insert(schema.events).values({
    id: opts.id,
    title: opts.id,
    mainSourceId: opts.sourceId,
    publishedAt: opts.publishedAt,
    rankScore: opts.baseScore, // start at base; recompute should adjust based on age + feedback
  });
  const judgmentId = await seedJudgment(opts.id);
  const scoreId = `es_${opts.id}`;
  await getDb().insert(schema.eventScores).values({
    id: scoreId,
    eventId: opts.id,
    scoringConfigVersion: "scoring-v1",
    judgmentId,
    baseScore: opts.baseScore,
    qualityScore: opts.baseScore,
    rankScore: opts.baseScore,
    displayScore: Math.round(opts.baseScore),
    breakdown: { test: true },
  });
  await getDb()
    .update(schema.events)
    .set({ currentScoreId: scoreId })
    .where(eq(schema.events.id, opts.id));
}

async function readEventCounts(id: string): Promise<{
  likeCount: number;
  starCount: number;
  downCount: number;
  viewCount: number;
  rankScore: number | null;
}> {
  const rows = await getDb()
    .select({
      likeCount: schema.events.likeCount,
      starCount: schema.events.starCount,
      downCount: schema.events.downCount,
      viewCount: schema.events.viewCount,
      rankScore: schema.events.rankScore,
    })
    .from(schema.events)
    .where(eq(schema.events.id, id));
  return rows[0]!;
}

describe("event reactions + rank-score recompute (real Postgres)", () => {
  test("addReaction increments denormalized count, removeReaction decrements", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_a", sourceId, publishedAt: new Date(NOW.getTime() - 3 * HOUR_MS), baseScore: 50 });

    const after1 = await reactions.addReaction({
      eventId: "evt_a",
      kind: "like",
      identity: { userId: "usr_1", fingerprint: null },
    });
    expect(after1.likeCount).toBe(1);
    expect(after1.starCount).toBe(0);
    const persisted1 = await readEventCounts("evt_a");
    expect(persisted1.likeCount).toBe(1);

    const after2 = await reactions.removeReaction({
      eventId: "evt_a",
      kind: "like",
      identity: { userId: "usr_1", fingerprint: null },
    });
    expect(after2.likeCount).toBe(0);
    const persisted2 = await readEventCounts("evt_a");
    expect(persisted2.likeCount).toBe(0);
  });

  test("down reaction increments denormalized count, removes cleanly, and conflicts with like", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_down", sourceId, publishedAt: NOW, baseScore: 50 });

    const afterDown = await reactions.addReaction({
      eventId: "evt_down",
      kind: "down",
      identity: { userId: "usr_down", fingerprint: null },
    });
    expect(afterDown.downCount).toBe(1);
    expect(afterDown.likeCount).toBe(0);

    const afterLike = await reactions.addReaction({
      eventId: "evt_down",
      kind: "like",
      identity: { userId: "usr_down", fingerprint: null },
    });
    expect(afterLike.likeCount).toBe(1);
    expect(afterLike.downCount).toBe(0);

    const afterRemove = await reactions.removeReaction({
      eventId: "evt_down",
      kind: "like",
      identity: { userId: "usr_down", fingerprint: null },
    });
    expect(afterRemove.likeCount).toBe(0);
    expect(afterRemove.downCount).toBe(0);
  });

  test("addReaction is idempotent per identity+kind (partial unique index holds)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_b", sourceId, publishedAt: NOW, baseScore: 50 });

    await reactions.addReaction({
      eventId: "evt_b",
      kind: "like",
      identity: { userId: "usr_dup", fingerprint: null },
    });
    const after = await reactions.addReaction({
      eventId: "evt_b",
      kind: "like",
      identity: { userId: "usr_dup", fingerprint: null },
    });
    expect(after.likeCount).toBe(1); // no double-count

    // Different identity (different user, same event+kind) DOES count.
    const after2 = await reactions.addReaction({
      eventId: "evt_b",
      kind: "like",
      identity: { userId: "usr_other", fingerprint: null },
    });
    expect(after2.likeCount).toBe(2);
  });

  test("removeReaction is idempotent (no-op when row not present)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c", sourceId, publishedAt: NOW, baseScore: 50 });

    const result = await reactions.removeReaction({
      eventId: "evt_c",
      kind: "star",
      identity: { userId: "usr_x", fingerprint: null },
    });
    expect(result.starCount).toBe(0);
  });

  test("distinct anonymous fingerprints both count", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_d", sourceId, publishedAt: NOW, baseScore: 50 });

    await reactions.addReaction({
      eventId: "evt_d",
      kind: "like",
      identity: { userId: null, fingerprint: "fp_aaa" },
    });
    const after = await reactions.addReaction({
      eventId: "evt_d",
      kind: "like",
      identity: { userId: null, fingerprint: "fp_bbb" },
    });
    expect(after.likeCount).toBe(2);
  });

  test("identity-XOR enforced: both null or both set rejected", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_e", sourceId, publishedAt: NOW, baseScore: 50 });

    await expectRejection(
      reactions.addReaction({
        eventId: "evt_e",
        kind: "like",
        identity: { userId: null, fingerprint: null },
      }),
      reactions.ReactionIdentityError,
    );
    await expectRejection(
      reactions.addReaction({
        eventId: "evt_e",
        kind: "like",
        identity: { userId: "usr_a", fingerprint: "fp_a" },
      }),
      reactions.ReactionIdentityError,
    );
  });

  test("addReaction throws EventNotFoundError for unknown event", async () => {
    await expectRejection(
      reactions.addReaction({
        eventId: "evt_missing",
        kind: "like",
        identity: { userId: "usr_x", fingerprint: null },
      }),
      reactions.EventNotFoundError,
    );
  });

  test("recomputeRankScores SQL matches the pure rank-score module", async () => {
    const sourceId = await seedSource();
    // Three events at distinct ages so each lands in a different band.
    await seedEvent({
      id: "evt_fresh",
      sourceId,
      publishedAt: new Date(NOW.getTime() - 3 * HOUR_MS),
      baseScore: 50, // 0-6h band
    });
    await seedEvent({
      id: "evt_mid",
      sourceId,
      publishedAt: new Date(NOW.getTime() - 48 * HOUR_MS),
      baseScore: 50, // 24h-7d band
    });
    await seedEvent({
      id: "evt_old",
      sourceId,
      publishedAt: new Date(NOW.getTime() - 30 * 24 * HOUR_MS),
      baseScore: 50, // 7d+ band
    });

    // Feedback: lots of likes + some stars on each.
    for (const evtId of ["evt_fresh", "evt_mid", "evt_old"]) {
      for (let i = 0; i < 30; i++) {
        await reactions.addReaction({
          eventId: evtId,
          kind: "like",
          identity: { userId: `u_${evtId}_${i}`, fingerprint: null },
        });
      }
      for (let i = 0; i < 8; i++) {
        await reactions.addReaction({
          eventId: evtId,
          kind: "star",
          identity: { userId: `s_${evtId}_${i}`, fingerprint: null },
        });
      }
    }
    await getDb()
      .update(schema.events)
      .set({ viewCount: 120 })
      .where(eq(schema.events.id, "evt_mid"));

    const result = await recompute.recomputeRankScores(NOW);
    expect(result.updated).toBeGreaterThan(0);
    expect(result.configVersion).toBe(rankScore.rankScoreConfig.version);

    // Verify SQL parity with the TS function for each event.
    const ages: Record<string, number> = { evt_fresh: 3, evt_mid: 48, evt_old: 30 * 24 };
    for (const evtId of Object.keys(ages)) {
      const row = await readEventCounts(evtId);
      const expected = rankScore.computeRankScore({
        baseScore: 50,
        likeCount: row.likeCount,
        starCount: row.starCount,
      viewCount: row.viewCount,
      ageHours: ages[evtId]!,
    });
      expect(row.rankScore).toBeCloseTo(expected.rankScore, 5);
    }

    // Older events with heavy stars should now outrank the fresh one (band 7d+ favors stars 12 vs 0-6h: 3).
    const fresh = await readEventCounts("evt_fresh");
    const old = await readEventCounts("evt_old");
    expect(old.rankScore!).toBeGreaterThan(fresh.rankScore!);
  });

  test("rank-v5: owner annotations feed the SQL recompute and match the TS owner-boost path", async () => {
    const sourceId = await seedSource();
    const publishedAt = new Date(NOW.getTime() - 3 * HOUR_MS);
    for (const id of ["evt_u1", "evt_u2", "evt_u3", "evt_neg"]) {
      await seedEvent({ id, sourceId, publishedAt, baseScore: 50 });
    }
    // 3 useful + 1 not_useful on the same source -> source affinity (3-1)/4 = 0.5 (n >= 3).
    for (const id of ["evt_u1", "evt_u2", "evt_u3"]) {
      await annotations.setOwnerAnnotation({ subjectType: "event", subjectId: id, verdict: "useful" });
    }
    await annotations.setOwnerAnnotation({
      subjectType: "event",
      subjectId: "evt_neg",
      verdict: "not_useful",
    });

    const result = await recompute.recomputeRankScores(NOW);
    expect(result.configVersion).toBe("rank-v5");
    expect(result.updated).toBeGreaterThan(0);

    const { profile, directVerdicts } = await recompute.loadOwnerAffinityProfile(getDb());
    expect(profile.source.get(sourceId)?.affinity).toBeCloseTo(0.5, 6);

    // SQL parity: rank = computeRankScore(..., ownerBoost = computeOwnerBoost(...)) per event.
    for (const evtId of ["evt_u1", "evt_neg"]) {
      const row = await readEventCounts(evtId);
      const boost = ownerAffinity.computeOwnerBoost(
        {
          directVerdict: directVerdicts.get(evtId) ?? null,
          sourceId,
          category: null,
          contentType: null,
        },
        profile,
        rankScore.rankScoreConfig.owner,
      );
      const expected = rankScore.computeRankScore({
        baseScore: 50,
        likeCount: row.likeCount,
        starCount: row.starCount,
        viewCount: row.viewCount,
        ageHours: 3,
        ownerBoost: boost.ownerBoost,
      });
      expect(row.rankScore).toBeCloseTo(expected.rankScore, 4);
    }

    // Direction check: useful-annotated rises above base, not_useful sinks below it.
    expect((await readEventCounts("evt_u1")).rankScore!).toBeGreaterThan(50);
    expect((await readEventCounts("evt_neg")).rankScore!).toBeLessThan(50);
  });

  test("getViewerReactions returns liked/starred per event for the viewer", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_v1", sourceId, publishedAt: NOW, baseScore: 50 });
    await seedEvent({ id: "evt_v2", sourceId, publishedAt: NOW, baseScore: 50 });
    await seedEvent({ id: "evt_v3", sourceId, publishedAt: NOW, baseScore: 50 });

    // Viewer (cookie identity) likes evt_v1 + stars evt_v2; another reader stars evt_v3.
    await reactions.addReaction({
      eventId: "evt_v1",
      kind: "like",
      identity: { userId: null, fingerprint: "rid_viewer" },
    });
    await reactions.addReaction({
      eventId: "evt_v2",
      kind: "star",
      identity: { userId: null, fingerprint: "rid_viewer" },
    });
    await reactions.addReaction({
      eventId: "evt_v2",
      kind: "down",
      identity: { userId: null, fingerprint: "rid_viewer" },
    });
    await reactions.addReaction({
      eventId: "evt_v3",
      kind: "star",
      identity: { userId: null, fingerprint: "rid_other" },
    });

    const viewerMap = await reactions.getViewerReactions(
      ["evt_v1", "evt_v2", "evt_v3"],
      { userId: null, fingerprint: "rid_viewer" },
    );
    expect(viewerMap.get("evt_v1")).toEqual({ liked: true, starred: false, downed: false });
    expect(viewerMap.get("evt_v2")).toEqual({ liked: false, starred: true, downed: true });
    expect(viewerMap.get("evt_v3")).toBeUndefined(); // belongs to another identity
  });

  test("getViewerReactions returns empty when identity is null", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_anon_only", sourceId, publishedAt: NOW, baseScore: 50 });
    await reactions.addReaction({
      eventId: "evt_anon_only",
      kind: "like",
      identity: { userId: null, fingerprint: "rid_x" },
    });

    const empty = await reactions.getViewerReactions(
      ["evt_anon_only"],
      { userId: null, fingerprint: null },
    );
    expect(empty.size).toBe(0);
  });

  test("getViewerReactions short-circuits on empty event list", async () => {
    const empty = await reactions.getViewerReactions(
      [],
      { userId: null, fingerprint: "rid_any" },
    );
    expect(empty.size).toBe(0);
  });

  test("recomputeRankScores skips events without a current_score_id", async () => {
    const sourceId = await seedSource();
    await getDb().insert(schema.events).values({
      id: "evt_no_score",
      title: "no score yet",
      mainSourceId: sourceId,
      publishedAt: NOW,
      // currentScoreId left null
    });

    const result = await recompute.recomputeRankScores(NOW);
    expect(result.updated).toBe(0);
    const row = await readEventCounts("evt_no_score");
    expect(row.rankScore).toBeNull();
  });
});
