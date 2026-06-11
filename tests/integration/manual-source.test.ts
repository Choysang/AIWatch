// Manual-source onboarding integration (Task 3, real Postgres). Validates:
//   - migration 0011 applies (connector_type enum gains 'manual'; sources gains curated cols)
//   - createSource persists curated provenance (brand_tag / recommended_by / recommend_reason
//     / onboarded_at) with a `manual` connector
//   - the ManualConnector auto-fetch is a no-op ([]) so cron never fabricates content
//   - ingestManualPost runs a hand-entered post through the SAME pipeline (gate -> stub judge
//     -> score -> event)
//   - the reader feed card carries the provenance + the pasted image media

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle;
let savedDatabaseUrl: string | undefined;

let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let createSource: typeof import("@/db/queries/sources").createSource;
let getConnector: typeof import("@/connectors/registry").getConnector;
let ingestManualPost: typeof import("@/sources/manual-ingest").ingestManualPost;
let manualPostInputSchema: typeof import("@/sources/manual-post").manualPostInputSchema;
let listRecentEvents: typeof import("@/db/queries/feed").listRecentEvents;
let extractImageUrl: typeof import("@/app/_lib/media").extractImageUrl;

const ONBOARDED = new Date("2026-05-20T00:00:00Z");
const IMAGE = "https://pbs.twimg.com/media/demo.jpg";

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  // Hand-entered posts go through the real fail-closed judge. Force the stub provider for the
  // light + deep stages so the test never makes a live LLM call (mirrors pipeline.test.ts);
  // without this, a configured real key takes precedence and the ingest call times out.
  process.env.LLM_STUB_FALLBACK = "1";
  process.env.LLM_LIGHT_PROVIDER = "stub";
  process.env.LLM_DEEP_PROVIDER = "stub";

  ({ getDb, resetDb } = await import("@/db/client"));
  ({ createSource } = await import("@/db/queries/sources"));
  ({ getConnector } = await import("@/connectors/registry"));
  ({ ingestManualPost } = await import("@/sources/manual-ingest"));
  ({ manualPostInputSchema } = await import("@/sources/manual-post"));
  ({ listRecentEvents } = await import("@/db/queries/feed"));
  ({ extractImageUrl } = await import("@/app/_lib/media"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
  delete process.env.LLM_STUB_FALLBACK;
  delete process.env.LLM_LIGHT_PROVIDER;
  delete process.env.LLM_DEEP_PROVIDER;
}, 60_000);

describe("manual source onboarding (real Postgres)", () => {
  let sourceId: string;

  test("createSource persists a manual X source with curated provenance", async () => {
    sourceId = await createSource({
      name: "OpenAI",
      platform: "x",
      sourceType: "official",
      level: "L2",
      connectorType: "manual",
      handle: "@OpenAI",
      url: "https://x.com/OpenAI",
      brandTag: "OpenAI",
      recommendedBy: "小蔡",
      recommendReason: "官方一手动态",
      onboardedAt: ONBOARDED,
    });
    expect(sourceId.startsWith("src_")).toBe(true);
  });

  test("ManualConnector auto-fetch is a no-op (no fabricated content)", async () => {
    const raw = await getConnector("manual").fetch({
      id: sourceId,
      platform: "x",
      connectorType: "manual",
      connectorRef: null,
      url: "https://x.com/OpenAI",
      handle: "@OpenAI",
    });
    expect(raw).toEqual([]);
  });

  test("ingestManualPost runs a hand-entered post through the pipeline into an event", async () => {
    const input = manualPostInputSchema.parse({
      url: "https://x.com/OpenAI/status/1929",
      content: "OpenAI 发布 GPT 新一代模型，推理与多模态能力大幅提升，并下调 API 价格。",
      title: "OpenAI 发布新模型",
      authorName: "OpenAI",
      authorHandle: "@OpenAI",
      imageUrl: IMAGE,
      publishedAt: "2026-05-21T10:00",
    });
    const summary = await ingestManualPost(sourceId, input);
    expect(summary.fetched).toBe(1);
    expect(summary.dropped).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.newEvents).toBe(1);
  });

  test("reader feed card carries provenance + pasted image", async () => {
    const cards = await listRecentEvents(30);
    const card = cards.find((c) => c.sourceName === "OpenAI");
    expect(card).toBeTruthy();
    expect(card!.sourceBrandTag).toBe("OpenAI");
    expect(card!.sourceRecommendedBy).toBe("小蔡");
    expect(card!.sourceRecommendReason).toBe("官方一手动态");
    expect(card!.sourceOnboardedAt).not.toBeNull();
    expect(card!.sourceUrl).toBe("https://x.com/OpenAI");
    expect(extractImageUrl(card!.media)).toBe(IMAGE);
  });

  test("re-ingesting the same URL dedups (no second event)", async () => {
    const input = manualPostInputSchema.parse({
      url: "https://x.com/OpenAI/status/1929",
      content: "OpenAI 发布 GPT 新一代模型，推理与多模态能力大幅提升，并下调 API 价格。",
    });
    const summary = await ingestManualPost(sourceId, input);
    expect(summary.newEvents).toBe(0);
    expect(summary.duplicates).toBe(1);
  });
});
