// Integration test for the 点9 Chinese-title backfill. Verifies it rewrites only
// CJK-free titles, replaces the summary only when the summary is also CJK-free, skips
// rows where the LLM still answers in English, and fails closed on budget exhaustion.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let backfill: typeof import("@/pipeline/backfill-chinese-text");
let domainBackfill: typeof import("@/pipeline/backfill-domain-content-type");

const SOURCE_ID = "src_bfzh";

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
  backfill = await import("@/pipeline/backfill-chinese-text");
  domainBackfill = await import("@/pipeline/backfill-domain-content-type");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "Src",
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
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.events);
});

async function insert(id: string, title: string, summary: string | null): Promise<void> {
  await getDb().insert(schema.events).values({
    id,
    title,
    summary,
    mainSourceId: SOURCE_ID,
    qualityScore: 70,
  });
}

async function fetchById(): Promise<Map<string, { title: string; summary: string | null }>> {
  const rows = await getDb()
    .select({ id: schema.events.id, title: schema.events.title, summary: schema.events.summary })
    .from(schema.events);
  return new Map(rows.map((r) => [r.id, { title: r.title, summary: r.summary }]));
}

describe("backfillChineseText (real Postgres)", () => {
  test("rewrites English titles; keeps Chinese summaries; trailing punctuation trimmed", async () => {
    await insert("e_en", "Grok Voice offers SOTA performance", "English summary here");
    await insert("e_mixed", "GPT-5 release notes", "已经是中文摘要了");
    await insert("e_cn", "已是中文标题", "中文摘要");

    const summarize = async () => "Grok 语音达到业界领先水平。";

    const summary = await backfill.backfillChineseText({ db: getDb(), summarize });
    expect(summary.scanned).toBe(2); // e_cn excluded by the CJK-title filter
    expect(summary.rewritten).toBe(2);
    expect(summary.failed).toBe(0);

    const byId = await fetchById();
    // title loses trailing 。 ; CJK-free summary replaced with the full one-liner
    expect(byId.get("e_en")).toEqual({
      title: "Grok 语音达到业界领先水平",
      summary: "Grok 语音达到业界领先水平。",
    });
    // already-Chinese summary preserved
    expect(byId.get("e_mixed")).toEqual({
      title: "Grok 语音达到业界领先水平",
      summary: "已经是中文摘要了",
    });
    expect(byId.get("e_cn")).toEqual({ title: "已是中文标题", summary: "中文摘要" });
  });

  test("leaves the row untouched when the model still answers in English", async () => {
    await insert("e_en", "English title", null);
    const summarize = async () => "Still English output";

    const summary = await backfill.backfillChineseText({ db: getDb(), summarize });
    expect(summary.skippedNonChinese).toBe(1);
    expect(summary.rewritten).toBe(0);

    const byId = await fetchById();
    expect(byId.get("e_en")).toEqual({ title: "English title", summary: null });
  });

  test("stops the batch on budget exhaustion (fail closed)", async () => {
    await insert("e_1", "English one", null);
    await insert("e_2", "English two", null);
    const summarize = async () => {
      throw new domainBackfill.BudgetExceededError("cap reached");
    };

    const summary = await backfill.backfillChineseText({ db: getDb(), summarize });
    expect(summary.budgetStopped).toBe(true);
    expect(summary.failed).toBe(1); // first row fails, loop breaks
    expect(summary.rewritten).toBe(0);
  });
});
