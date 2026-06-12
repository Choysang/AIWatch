// End-to-end spine integration test (decision A walking skeleton, decision H real pg):
//   source row -> MockConnector -> $0 gate -> dedup -> cold_judge (stub) ->
//   deterministic base_score -> append-only event/judgment/score -> reader feed query.
// Asserts rows, provenance stamps, score correctness, idempotency, and append-only behavior.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";
import { DEEP_EXTRACT_PROMPT_VERSION } from "@/pipeline/prompts";

let pgHandle: PgHandle;
let savedEnv: Record<string, string | undefined>;

// Dynamic imports AFTER DATABASE_URL is set keep module load order honest even though
// the db client is lazy; getDb() returns the real (un-proxied) instance for assertions.
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let processSource: typeof import("@/pipeline/process-source").processSource;
let listRecentEvents: typeof import("@/db/queries/feed").listRecentEvents;
let MockConnector: typeof import("@/connectors/mock").MockConnector;

const SOURCE_ID = `src_it_openai_${Date.now()}`;
const ENV_KEYS = [
  "DATABASE_URL",
  "LLM_STUB_FALLBACK",
  "LLM_LIGHT_PROVIDER",
  "LLM_DEEP_PROVIDER",
  "LLM_NEWS_PROVIDER",
  "LLM_NEWS_MODEL",
] as const;

beforeAll(async () => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];

  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  process.env.LLM_STUB_FALLBACK = "1";
  process.env.LLM_LIGHT_PROVIDER = "stub";
  process.env.LLM_DEEP_PROVIDER = "stub";
  delete process.env.LLM_NEWS_PROVIDER;
  delete process.env.LLM_NEWS_MODEL;

  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ processSource } = await import("@/pipeline/process-source"));
  ({ listRecentEvents } = await import("@/db/queries/feed"));
  ({ MockConnector } = await import("@/connectors/mock"));

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
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
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
      expect(ev.pipelineTier).toBe("T2");
      expect(ev.pipelineScore).toBeGreaterThanOrEqual(80);
      expect(ev.oneLineSummary).toBeTruthy();
      expect(ev.detailedSummary).toBeTruthy();
    }
  });

  test("stamps provenance on judgments and scores", async () => {
    const [judgment] = await getDb().select().from(schema.eventJudgments).limit(1);
    expect(judgment!.provider).toBe("stub");
    expect(judgment!.promptVersion).toBe(DEEP_EXTRACT_PROMPT_VERSION);
    expect(judgment!.routingConfigVersion).toBe("routing-v4");
    expect(judgment!.triggerReason).toBe("initial");

    const [score] = await getDb().select().from(schema.eventScores).limit(1);
    expect(score!.scoringConfigVersion).toBe("scoring-v1");
    expect(score!.judgmentId).toBe(judgment!.id);
    expect(score!.breakdown).toBeTruthy();
  });

  test("scoring uses independent light LLM dimensions, not copied pipeline_score", async () => {
    const conn = await new MockConnector().fetch(dueSource);
    const openai = conn.find((p) => p.externalId === "mock-1")!;

    // Find the event whose main post is the OpenAI post and compare stored scoring inputs.
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
    const judgment = (
      await getDb().select().from(schema.eventJudgments).where(eq(schema.eventJudgments.id, score.judgmentId))
    )[0]!;
    const pipelineScore = ev.pipelineScore;
    if (pipelineScore === null) throw new Error("expected pipelineScore");

    expect(judgment.aiRelevance).toBe(86);
    expect(judgment.impact).toBe(78);
    expect(judgment.novelty).toBe(72);
    expect(judgment.audienceUsefulness).toBe(80);
    expect(judgment.evidenceClarity).toBe(88);
    expect(new Set([
      judgment.aiRelevance,
      judgment.impact,
      judgment.novelty,
      judgment.audienceUsefulness,
      judgment.evidenceClarity,
    ])).not.toEqual(new Set([pipelineScore]));

    expect(score.baseScore).not.toBe(pipelineScore);
    expect(score.eventQualityScore).not.toBe(pipelineScore);
    expect(ev.qualityScore).toBe(Math.round(score.baseScore));
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
