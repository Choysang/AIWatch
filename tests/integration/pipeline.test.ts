// End-to-end spine integration test (decision A walking skeleton, decision H real pg):
//   source row -> MockConnector -> $0 gate -> dedup -> cold_judge (stub) ->
//   deterministic base_score -> append-only event/judgment/score -> reader feed query.
// Asserts rows, provenance stamps, score correctness, idempotency, and append-only behavior.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle;

// Dynamic imports AFTER DATABASE_URL is set keep module load order honest even though
// the db client is lazy; getDb() returns the real (un-proxied) instance for assertions.
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let processSource: typeof import("@/pipeline/process-source").processSource;
let listRecentEvents: typeof import("@/db/queries/feed").listRecentEvents;
let computeBaseScore: typeof import("@/scoring/base-score").computeBaseScore;
let externalHeatScore: typeof import("@/scoring/external-heat").externalHeatScore;
let MockConnector: typeof import("@/connectors/mock").MockConnector;
let DEFAULT_JUDGMENT: typeof import("@/llm/stub").DEFAULT_JUDGMENT;

const SOURCE_ID = "src_it_openai";

beforeAll(async () => {
  // Honor a provided DATABASE_URL (CI Postgres service); otherwise boot embedded pg locally.
  if (!process.env.DATABASE_URL) {
    pgHandle = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pgHandle.connectionString;
  }
  // Pipeline now fails closed when no real LLM key is configured (Scoring Integrity slice).
  // The spine test verifies the stub provenance specifically, so opt into stub fallback
  // for the duration of this test file.
  process.env.LLM_STUB_FALLBACK = "1";

  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ processSource } = await import("@/pipeline/process-source"));
  ({ listRecentEvents } = await import("@/db/queries/feed"));
  ({ computeBaseScore } = await import("@/scoring/base-score"));
  ({ externalHeatScore } = await import("@/scoring/external-heat"));
  ({ MockConnector } = await import("@/connectors/mock"));
  ({ DEFAULT_JUDGMENT } = await import("@/llm/stub"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });

  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "OpenAI Blog",
      platform: "blog",
      level: "L1",
      sourceType: "official",
      connectorType: "mock",
      url: "https://openai.com/blog",
    });
}, 120_000);

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

afterAll(async () => {
  // Close + clear the db singleton before stopping Postgres so (a) idle connections don't
  // error on teardown and (b) the next test file re-inits against its own database.
  // Each step is time-boxed so a slow/stuck shutdown can never hang the whole suite.
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  // Only clear the env we set, so a later test file boots its own embedded pg (and a
  // CI-provided DATABASE_URL, where pgHandle is undefined, is left intact).
  if (pgHandle) delete process.env.DATABASE_URL;
  delete process.env.LLM_STUB_FALLBACK;
}, 60_000); // Postgres graceful shutdown can exceed Bun's default 5s hook timeout.

const dueSource = {
  id: SOURCE_ID,
  platform: "blog" as const,
  connectorType: "mock" as const,
  connectorRef: null,
  url: "https://openai.com/blog",
  handle: null,
  level: "L1" as const,
};

describe("pipeline spine (real Postgres)", () => {
  test("creates one event + judgment + score per mock post", async () => {
    const raw = await new MockConnector().fetch(dueSource);
    const summary = await processSource(dueSource, raw);

    expect(summary.fetched).toBe(raw.length);
    expect(summary.dropped).toBe(0);
    expect(summary.newEvents).toBe(raw.length);
    expect(summary.duplicates).toBe(0);
    expect(summary.merged).toBe(0);
    expect(summary.failed).toBe(0);

    const events = await getDb().select().from(schema.events);
    const judgments = await getDb().select().from(schema.eventJudgments);
    const scores = await getDb().select().from(schema.eventScores);
    expect(events).toHaveLength(raw.length);
    expect(judgments).toHaveLength(raw.length);
    expect(scores).toHaveLength(raw.length);

    for (const ev of events) {
      expect(ev.currentJudgmentId).not.toBeNull();
      expect(ev.currentScoreId).not.toBeNull();
      expect(ev.mainSourceId).toBe(SOURCE_ID);
    }
  });

  test("stamps provenance on judgments and scores", async () => {
    const [judgment] = await getDb().select().from(schema.eventJudgments).limit(1);
    expect(judgment!.provider).toBe("stub");
    expect(judgment!.promptVersion).toBe("cold-judge-v1");
    expect(judgment!.routingConfigVersion).toBe("routing-v1");
    expect(judgment!.triggerReason).toBe("initial");

    const [score] = await getDb().select().from(schema.eventScores).limit(1);
    expect(score!.scoringConfigVersion).toBe("scoring-v1");
    expect(score!.judgmentId).toBe(judgment!.id);
    expect(score!.breakdown).toBeTruthy();
  });

  test("base_score matches the deterministic formula for the L1 OpenAI post", async () => {
    const conn = await new MockConnector().fetch(dueSource);
    const openai = conn.find((p) => p.externalId === "mock-1")!;
    const externalHeat = externalHeatScore(openai.publicMetrics, "blog");
    const { baseScore } = computeBaseScore({
      sourceLevel: "L1",
      dimensions: {
        aiRelevance: DEFAULT_JUDGMENT.aiRelevance,
        impact: DEFAULT_JUDGMENT.impact,
        novelty: DEFAULT_JUDGMENT.novelty,
        audienceUsefulness: DEFAULT_JUDGMENT.audienceUsefulness,
        evidenceClarity: DEFAULT_JUDGMENT.evidenceClarity,
      },
      externalHeat,
    });

    // Find the event whose main post is the OpenAI post and compare its stored score.
    const posts = await getDb()
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.url, openai.url!));
    const post = posts[0]!;
    const ev = (
      await getDb().select().from(schema.events).where(eq(schema.events.mainPostId, post.id))
    )[0]!;
    const score = (
      await getDb().select().from(schema.eventScores).where(eq(schema.eventScores.eventId, ev.id))
    )[0]!;
    expect(score.baseScore).toBeCloseTo(baseScore, 5);
    expect(ev.qualityScore).toBe(Math.round(baseScore));
  });

  test("re-running is idempotent: duplicates skipped, no new events or judgments", async () => {
    const before = await getDb().select().from(schema.events);
    const judgmentsBefore = await getDb().select().from(schema.eventJudgments);

    const raw = await new MockConnector().fetch(dueSource);
    const summary = await processSource(dueSource, raw);
    expect(summary.duplicates).toBe(raw.length);
    expect(summary.newEvents).toBe(0);

    const after = await getDb().select().from(schema.events);
    const judgmentsAfter = await getDb().select().from(schema.eventJudgments);
    expect(after).toHaveLength(before.length);
    expect(judgmentsAfter).toHaveLength(judgmentsBefore.length); // append-only, not re-judged
  });

  test("reader feed returns cards joined with the source", async () => {
    const cards = await listRecentEvents(30);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      expect(card.sourceName).toBe("OpenAI Blog");
      expect(card.title.length).toBeGreaterThan(0);
      expect(typeof card.qualityScore).toBe("number");
    }
  });
});
