// Integration test for fail-closed judge + judge_failed status (Scoring Integrity / Phase C).
// Verifies that when the cold_judge provider has no key configured and stub fallback is
// disabled, the pipeline marks the post judge_failed and creates no event.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let processSource: typeof import("@/pipeline/process-source").processSource;
let MockConnector: typeof import("@/connectors/mock").MockConnector;

const SOURCE_ID = "src_judge_failed";

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  // Strip all LLM-related env vars so the route fails closed.
  delete process.env.LLM_STUB_FALLBACK;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.QWEN_API_KEY;
  delete process.env.OPENAI_COMPATIBLE_API_KEY;

  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ processSource } = await import("@/pipeline/process-source"));
  ({ MockConnector } = await import("@/connectors/mock"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "JudgeFailed Source",
      platform: "blog",
      level: "L2",
      sourceType: "official",
      connectorType: "mock",
      url: "https://example.com/blog",
    })
    .onConflictDoNothing();
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.posts);
});

const dueSource = {
  id: SOURCE_ID,
  platform: "blog" as const,
  connectorType: "mock" as const,
  connectorRef: null,
  url: "https://example.com/blog",
  handle: null,
  level: "L2" as const,
};

describe("processSource — fail-closed + judge_failed (real Postgres)", () => {
  test("posts get judge_error=no_key when no provider key is set and stub fallback is off", async () => {
    const raw = await new MockConnector().fetch(dueSource);
    const summary = await processSource(dueSource, raw);

    expect(summary.fetched).toBe(raw.length);
    expect(summary.newEvents).toBe(0);
    expect(summary.failed).toBe(raw.length);
    expect(summary.judgeFailedNoKey).toBe(raw.length);
    expect(summary.judgeFailedSchema).toBe(0);
    expect(summary.judgeFailedProvider).toBe(0);

    const events = await getDb().select().from(schema.events);
    expect(events).toHaveLength(0);

    const judgeFailed = await getDb()
      .select({ id: schema.posts.id, err: schema.posts.judgeError, at: schema.posts.judgeFailedAt })
      .from(schema.posts);
    expect(judgeFailed.length).toBe(raw.length);
    for (const p of judgeFailed) {
      expect(p.err).toBe("no_key");
      expect(p.at).not.toBeNull();
    }
  });

  test("stub fallback restores happy-path event creation when enabled", async () => {
    process.env.LLM_STUB_FALLBACK = "1";
    try {
      const raw = await new MockConnector().fetch(dueSource);
      const summary = await processSource(dueSource, raw);
      expect(summary.newEvents).toBe(raw.length);
      expect(summary.failed).toBe(0);

      const events = await getDb().select().from(schema.events);
      expect(events).toHaveLength(raw.length);

      // posts.judgeError remains null on the happy path.
      const errs = await getDb()
        .select({ err: schema.posts.judgeError })
        .from(schema.posts)
        .where(eq(schema.posts.sourceId, SOURCE_ID));
      for (const e of errs) expect(e.err).toBeNull();
    } finally {
      delete process.env.LLM_STUB_FALLBACK;
    }
  });
});
