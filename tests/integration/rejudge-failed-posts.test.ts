// Integration test for rejudgeFailedPosts (auto-heal of judge_failed posts) against real
// Postgres. Focuses on the SELECTION logic — which judge_error reasons + age window are picked
// up — which is the new behavior. LLM keys are stripped so the judge fails closed (no_key),
// making outcomes deterministic; we assert `scanned` (the matched batch) rather than judge
// results. Mirrors judge-failed.test.ts setup.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let rejudge: typeof import("@/pipeline/rejudge-failed-posts");

const SOURCE_ID = "src_rejudge";
const HOUR_MS = 60 * 60 * 1000;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  // Fail closed so the judge can't create events — keeps `scanned` the only moving part.
  delete process.env.LLM_STUB_FALLBACK;
  for (const k of [
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "QWEN_API_KEY",
    "OPENAI_COMPATIBLE_API_KEY",
  ]) {
    delete process.env[k];
  }

  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  rejudge = await import("@/pipeline/rejudge-failed-posts");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({ id: SOURCE_ID, name: "Rejudge Src", platform: "blog", level: "L2", sourceType: "official", connectorType: "mock" })
    .onConflictDoNothing();
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

function failedPost(id: string, judgeError: string | null, ageHours: number) {
  return {
    id,
    sourceId: SOURCE_ID,
    platform: "blog" as const,
    rawTitle: `t-${id}`,
    rawContent: "body",
    judgeError,
    judgeFailedAt: judgeError ? new Date(Date.now() - ageHours * HOUR_MS) : null,
  };
}

beforeEach(async () => {
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.posts);
  await getDb()
    .insert(schema.posts)
    .values([
      failedPost("p_prov", "provider_error", 1),
      failedPost("p_unknown", "unknown", 1),
      failedPost("p_schema", "schema_invalid", 1),
      failedPost("p_budget", "budget_exceeded", 1),
      failedPost("p_nokey", "no_key", 1),
      failedPost("p_old_prov", "provider_error", 72),
      failedPost("p_ok", null, 0),
    ]);
});

describe("rejudgeFailedPosts selection", () => {
  test("transient reasons retry only provider_error + unknown (any age)", async () => {
    const tally = await rejudge.rejudgeFailedPosts(getDb(), {
      reasons: rejudge.REJUDGE_TRANSIENT_REASONS,
    });
    // p_prov, p_unknown, p_old_prov — not schema/budget/no_key/healthy.
    expect(tally.scanned).toBe(3);
  });

  test("full sweep also retries schema_invalid, still excludes budget_exceeded / no_key", async () => {
    const tally = await rejudge.rejudgeFailedPosts(getDb()); // default = all retryable reasons
    // p_prov, p_unknown, p_old_prov, p_schema.
    expect(tally.scanned).toBe(4);
  });

  test("hours window bounds the auto-heal to recent failures", async () => {
    const tally = await rejudge.rejudgeFailedPosts(getDb(), {
      reasons: rejudge.REJUDGE_TRANSIENT_REASONS,
      hours: 48,
    });
    // p_old_prov (72h) drops out; only the two recent transient failures remain.
    expect(tally.scanned).toBe(2);
  });

  test("limit caps the batch size", async () => {
    const tally = await rejudge.rejudgeFailedPosts(getDb(), { limit: 1 });
    expect(tally.scanned).toBe(1);
  });
});
