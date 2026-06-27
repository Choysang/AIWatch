// Integration tests for the scoring-v2 data layer (SP4 stage 4.2a):
//   - recomputeScoresV2: re-derives the five layers, denormalizes selection/confidence/
//     max-level onto events, and appends a v2 event_scores snapshot.
//   - multi-source corroboration raises confidence (and thus selection).
//   - events without a content_type (pre-backfill) are skipped.
//   - low confidence caps selection_max_level at B; high confidence allows S.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let recomputeScoresV2: typeof import("@/db/jobs/recompute-scores-v2").recomputeScoresV2;
let checkPromotionV2: typeof import("@/db/jobs/check-promotion-v2").checkPromotionV2;

const L1 = "src_v2_l1";
const L3 = "src_v2_l3";
const L5 = "src_v2_l5";
const NOW = new Date("2026-05-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

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
  ({ recomputeScoresV2 } = await import("@/db/jobs/recompute-scores-v2"));
  ({ checkPromotionV2 } = await import("@/db/jobs/check-promotion-v2"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  for (const [id, level] of [
    [L1, "L1"],
    [L3, "L3"],
    [L5, "L5"],
  ] as const) {
    await getDb()
      .insert(schema.sources)
      .values({
        id,
        name: id,
        platform: "blog",
        level,
        sourceType: "official",
        connectorType: "mock",
      })
      .onConflictDoNothing({ target: schema.sources.id });
  }
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.ownerAnnotations);
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.posts);
});

interface SeedV2Opts {
  id: string;
  sourceId?: string;
  contentType?: "release" | "research" | "howto" | "opinion" | "news" | null;
  dims?: { aiRelevance: number; impact: number; novelty: number; audienceUsefulness: number; evidenceClarity: number };
  baseScore?: number;
  viewCount?: number;
  /** Number of independent posts merged into the event (drives corroboration). */
  postCount?: number;
  publishedAt?: Date;
  selectedLevel?: "none" | "B" | "A" | "S";
  directPushAt?: Date | null;
}

async function seedV2Event(opts: SeedV2Opts): Promise<void> {
  const sourceId = opts.sourceId ?? L3;
  const publishedAt = opts.publishedAt ?? ago(0.5);
  const dims = opts.dims ?? {
    aiRelevance: 80,
    impact: 70,
    novelty: 60,
    audienceUsefulness: 65,
    evidenceClarity: 75,
  };
  const baseScore = opts.baseScore ?? 80;
  const jId = `ej_${opts.id}`;
  const sId = `es_${opts.id}`;
  const contentType = opts.contentType === undefined ? "howto" : opts.contentType;

  await getDb().insert(schema.events).values({
    id: opts.id,
    title: opts.id,
    contentType: contentType ?? undefined,
    mainSourceId: sourceId,
    publishedAt,
    lastStrongSignalAt: publishedAt,
    selectedLevel: opts.selectedLevel ?? "none",
    viewCount: opts.viewCount ?? 0,
    expertDirectPushAt: opts.directPushAt ?? null,
    expertDirectPushBy: opts.directPushAt ? "tester" : null,
  });
  await getDb().insert(schema.eventJudgments).values({
    id: jId,
    eventId: opts.id,
    provider: "stub",
    modelId: "stub",
    promptVersion: "p",
    routingConfigVersion: "r",
    aiRelevance: dims.aiRelevance,
    impact: dims.impact,
    novelty: dims.novelty,
    audienceUsefulness: dims.audienceUsefulness,
    evidenceClarity: dims.evidenceClarity,
    contentType: contentType ?? undefined,
  });
  await getDb().insert(schema.eventScores).values({
    id: sId,
    eventId: opts.id,
    scoringConfigVersion: "scoring-v1",
    judgmentId: jId,
    baseScore,
    qualityScore: baseScore,
    rankScore: baseScore,
    displayScore: Math.round(baseScore),
    breakdown: {},
  });

  const postCount = opts.postCount ?? 1;
  for (let i = 0; i < postCount; i++) {
    const pId = `post_${opts.id}_${i}`;
    await getDb().insert(schema.posts).values({ id: pId, sourceId, platform: "blog" });
    await getDb().insert(schema.eventPosts).values({ eventId: opts.id, postId: pId, relation: "same_event" });
  }

  await getDb()
    .update(schema.events)
    .set({ currentScoreId: sId, currentJudgmentId: jId })
    .where(eq(schema.events.id, opts.id));
}

async function readEvent(id: string) {
  return (
    await getDb()
      .select({
        selectionScore: schema.events.selectionScore,
        confidenceScore: schema.events.confidenceScore,
        selectionMaxLevel: schema.events.selectionMaxLevel,
        currentScoreId: schema.events.currentScoreId,
      })
      .from(schema.events)
      .where(eq(schema.events.id, id))
  )[0]!;
}

describe("recomputeScoresV2 (real Postgres)", () => {
  test("denormalizes selection/confidence/max-level and appends a v2 score row", async () => {
    await seedV2Event({ id: "basic" });

    const r = await recomputeScoresV2(NOW, getDb());
    expect(r.candidates).toBe(1);
    expect(r.recomputed).toBe(1);
    expect(r.skipped).toBe(0);

    const ev = await readEvent("basic");
    expect(ev.selectionScore).not.toBeNull();
    expect(ev.confidenceScore).not.toBeNull();
    expect(ev.selectionMaxLevel).toBeOneOf(["B", "S"]);

    // currentScoreId repointed to the freshly-appended v2 row, which carries the v2 columns.
    const row = (
      await getDb()
        .select({
          selectionScore: schema.eventScores.selectionScore,
          confidenceScore: schema.eventScores.confidenceScore,
          eventQualityScore: schema.eventScores.eventQualityScore,
        })
        .from(schema.eventScores)
        .where(eq(schema.eventScores.id, ev.currentScoreId!))
    )[0]!;
    expect(row.selectionScore).toBeCloseTo(ev.selectionScore!, 6);
    expect(row.eventQualityScore).not.toBeNull();
  });

  test("multi-source corroboration raises confidence and selection", async () => {
    await seedV2Event({ id: "single", sourceId: L3, postCount: 1 });
    await seedV2Event({ id: "corroborated", sourceId: L3, postCount: 4 });

    await recomputeScoresV2(NOW, getDb());

    const single = await readEvent("single");
    const corroborated = await readEvent("corroborated");
    expect(corroborated.confidenceScore!).toBeGreaterThan(single.confidenceScore!);
    expect(corroborated.selectionScore!).toBeGreaterThan(single.selectionScore!);
  });

  test("views raise selection without changing confidence", async () => {
    await seedV2Event({ id: "cold", sourceId: L3, viewCount: 0 });
    await seedV2Event({ id: "viewed", sourceId: L3, viewCount: 200 });

    await recomputeScoresV2(NOW, getDb());

    const cold = await readEvent("cold");
    const viewed = await readEvent("viewed");
    expect(viewed.confidenceScore!).toBeCloseTo(cold.confidenceScore!, 6);
    expect(viewed.selectionScore!).toBeGreaterThan(cold.selectionScore!);
  });

  test("events without a content_type are skipped (pre-backfill)", async () => {
    await seedV2Event({ id: "unclassified", contentType: null });

    const r = await recomputeScoresV2(NOW, getDb());
    expect(r.skipped).toBe(1);
    expect(r.recomputed).toBe(0);

    const ev = await readEvent("unclassified");
    expect(ev.selectionScore).toBeNull();
  });

  test("low confidence caps max-level at B; high confidence allows S", async () => {
    // Low: weakest source, single post, low evidence -> confidence < 40.
    await seedV2Event({
      id: "low_conf",
      sourceId: L5,
      postCount: 1,
      dims: { aiRelevance: 80, impact: 70, novelty: 60, audienceUsefulness: 65, evidenceClarity: 10 },
    });
    // High: top source, well-corroborated, strong evidence -> confidence >= 40.
    await seedV2Event({
      id: "high_conf",
      sourceId: L1,
      postCount: 4,
      dims: { aiRelevance: 90, impact: 85, novelty: 80, audienceUsefulness: 80, evidenceClarity: 90 },
    });

    await recomputeScoresV2(NOW, getDb());

    expect((await readEvent("low_conf")).selectionMaxLevel).toBe("B");
    expect((await readEvent("high_conf")).selectionMaxLevel).toBe("S");
  });
});

async function readLevel(id: string) {
  return (
    await getDb()
      .select({
        level: schema.events.selectedLevel,
        label: schema.events.selectedLabel,
        breakdown: schema.events.selectedBreakdown,
      })
      .from(schema.events)
      .where(eq(schema.events.id, id))
  )[0]!;
}

describe("checkPromotionV2 (real Postgres)", () => {
  test("a strong, well-corroborated event is promoted on selection_score", async () => {
    await seedV2Event({
      id: "strong",
      sourceId: L1,
      postCount: 4,
      contentType: "release",
      dims: { aiRelevance: 90, impact: 90, novelty: 80, audienceUsefulness: 80, evidenceClarity: 90 },
      publishedAt: ago(0.2),
    });

    await recomputeScoresV2(NOW, getDb());
    const result = await checkPromotionV2(NOW, getDb());
    expect(result.candidates).toBe(1);

    const ev = await readLevel("strong");
    expect(ev.level).toBeOneOf(["A", "S"]);
    const bd = ev.breakdown as Record<string, unknown>;
    expect(bd.selectionScore as number).toBeGreaterThanOrEqual(86);
    expect(bd.maxLevel).toBe("S");
  });

  test("a weak event is not promoted", async () => {
    await seedV2Event({
      id: "weak",
      sourceId: L5,
      postCount: 1,
      dims: { aiRelevance: 60, impact: 20, novelty: 20, audienceUsefulness: 20, evidenceClarity: 20 },
      publishedAt: ago(0.2),
    });

    await recomputeScoresV2(NOW, getDb());
    await checkPromotionV2(NOW, getDb());

    expect((await readLevel("weak")).level).toBe("none");
  });

  test("events without a selection_score (not yet recomputed) are excluded", async () => {
    await seedV2Event({ id: "no_recompute", sourceId: L1, postCount: 4, publishedAt: ago(0.2) });

    // Tournament runs WITHOUT a prior recompute -> selection_score is null -> no candidates.
    const result = await checkPromotionV2(NOW, getDb());
    expect(result.candidates).toBe(0);
    expect((await readLevel("no_recompute")).level).toBe("none");
  });

  test("enforces slot limits and cascades overflow to the next tier", async () => {
    const tightConfig = (await import("@/scoring/config")).scoringConfig;
    const config = {
      ...tightConfig,
      promotion: { ...tightConfig.promotion, slots: { B: 2, A: 1, S: 1 } },
    };
    for (const [id, impact] of [
      ["s1", 98],
      ["s2", 96],
      ["s3", 94],
    ] as const) {
      await seedV2Event({
        id,
        sourceId: L1,
        postCount: 4,
        contentType: "release",
        dims: { aiRelevance: 95, impact, novelty: 90, audienceUsefulness: 90, evidenceClarity: 95 },
        publishedAt: ago(0.2),
      });
    }

    await recomputeScoresV2(NOW, getDb());
    await checkPromotionV2(NOW, getDb(), config);

    expect((await readLevel("s1")).level).toBe("S");
    expect((await readLevel("s2")).level).toBe("A");
    expect((await readLevel("s3")).level).toBe("B");
  });

  test("never downgrades an already-selected event and is idempotent", async () => {
    await seedV2Event({
      id: "keep_s",
      sourceId: L5,
      selectedLevel: "S",
      dims: { aiRelevance: 80, impact: 40, novelty: 40, audienceUsefulness: 40, evidenceClarity: 40 },
      publishedAt: ago(0.2),
    });
    await seedV2Event({
      id: "idem",
      sourceId: L1,
      postCount: 4,
      contentType: "release",
      dims: { aiRelevance: 95, impact: 95, novelty: 90, audienceUsefulness: 90, evidenceClarity: 95 },
      publishedAt: ago(0.2),
    });

    await recomputeScoresV2(NOW, getDb());
    await checkPromotionV2(NOW, getDb());
    const first = await readLevel("idem");

    await checkPromotionV2(new Date(NOW.getTime() + 60_000), getDb());
    const second = await readLevel("idem");

    expect((await readLevel("keep_s")).level).toBe("S");
    expect(second.level).toBe(first.level);
  });

  test("expert direct-push forces B regardless of selection score", async () => {
    await seedV2Event({
      id: "push_me",
      sourceId: L5,
      directPushAt: NOW,
      dims: { aiRelevance: 60, impact: 10, novelty: 10, audienceUsefulness: 10, evidenceClarity: 10 },
      publishedAt: ago(0.2),
    });

    await recomputeScoresV2(NOW, getDb());
    await checkPromotionV2(NOW, getDb());

    const ev = await readLevel("push_me");
    expect(ev.level).toBe("B");
    expect((ev.breakdown as Record<string, unknown>).directPushed).toBe(true);
  });

  test("owner not_useful annotations can remove an already-selected event from selection", async () => {
    await seedV2Event({
      id: "marked_bad",
      sourceId: L1,
      selectedLevel: "B",
      contentType: "news",
      dims: { aiRelevance: 90, impact: 90, novelty: 85, audienceUsefulness: 80, evidenceClarity: 90 },
      publishedAt: ago(0.2),
    });
    await getDb().insert(schema.ownerAnnotations).values({
      id: "anno_marked_bad",
      subjectType: "event",
      subjectId: "marked_bad",
      verdict: "not_useful",
    });

    await recomputeScoresV2(NOW, getDb());
    const result = await checkPromotionV2(NOW, getDb());

    const ev = await readLevel("marked_bad");
    expect(result.demoted).toBe(1);
    expect(ev.level).toBe("none");
    expect((ev.breakdown as Record<string, unknown>).editorialReasons).toContain("owner_annotation");
  });
});
