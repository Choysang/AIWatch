// Integration test for full-text get-or-extract (v0.5 B1.1) against real Postgres. Exercises
// the cache policy (ok/empty cached, error cooldown), the no-post "unavailable" path, and a
// fresh extraction whose URL the SSRF guard rejects (so no real network) — asserting the
// error status is persisted. The happy fetch path is covered by extract.test.ts (pure).

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let getOrExtractFulltext: typeof import("@/db/queries/article-fulltext").getOrExtractFulltext;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

const NOW = new Date("2026-06-14T12:00:00Z");

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ getOrExtractFulltext } = await import("@/db/queries/article-fulltext"));
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({ id: "src_a", name: "A", platform: "blog", level: "L1", sourceType: "official", connectorType: "mock" })
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
  await getDb().delete(schema.posts);
});

async function seed(post: Record<string, unknown>, eventId = "evt1", mainPostId: string | null = "post1") {
  await getDb().insert(schema.posts).values({ id: "post1", sourceId: "src_a", platform: "blog", ...post });
  await getDb().insert(schema.events).values({ id: eventId, title: "t", mainPostId, mainSourceId: "src_a" });
}

describe("getOrExtractFulltext", () => {
  test("serves a cached 'ok' extraction without re-fetching (no blocks → empty array)", async () => {
    await seed({ url: "https://x.example/a", fullText: "cached article body", fullTextStatus: "ok", fullTextFetchedAt: NOW });
    const result = await getOrExtractFulltext("evt1", getDb(), NOW);
    expect(result).toEqual({ status: "ok", text: "cached article body", blocks: [] });
  });

  test("serves cached rich blocks (B1.5) alongside the text", async () => {
    const blocks = [{ type: "paragraph" as const, spans: [{ text: "hello" }] }];
    await seed({ url: "https://x.example/a", fullText: "hello", fullBlocks: blocks, fullTextStatus: "ok", fullTextFetchedAt: NOW });
    const result = await getOrExtractFulltext("evt1", getDb(), NOW);
    expect(result).toEqual({ status: "ok", text: "hello", blocks });
  });

  test("returns cached 'empty' and 'error' (within cooldown) without re-fetching", async () => {
    await seed({ url: "https://x.example/a", fullTextStatus: "empty", fullTextFetchedAt: NOW });
    expect(await getOrExtractFulltext("evt1", getDb(), NOW)).toEqual({ status: "empty", text: null, blocks: null });

    await getDb().delete(schema.events);
    await getDb().delete(schema.posts);
    await seed({ url: "https://x.example/a", fullTextStatus: "error", fullTextFetchedAt: NOW });
    // 30 min later — still inside the 1h cooldown.
    const within = new Date(NOW.getTime() + 30 * 60 * 1000);
    expect(await getOrExtractFulltext("evt1", getDb(), within)).toEqual({ status: "error", text: null, blocks: null });
  });

  test("a fresh extraction with an unsafe URL records error (SSRF guard, no network)", async () => {
    await seed({ url: "http://127.0.0.1/secret" }); // status null -> attempt extraction
    const result = await getOrExtractFulltext("evt1", getDb(), NOW);
    expect(result).toEqual({ status: "error", text: null, blocks: null });

    const [row] = await getDb()
      .select({ status: schema.posts.fullTextStatus })
      .from(schema.posts)
      .where(eq(schema.posts.id, "post1"));
    expect(row?.status).toBe("error");
  });

  test("records 'empty' when the post has no URL to fetch", async () => {
    await seed({ url: null });
    expect(await getOrExtractFulltext("evt1", getDb(), NOW)).toEqual({ status: "empty", text: null, blocks: null });
  });

  test("returns 'unavailable' when the event has no main post", async () => {
    await getDb().insert(schema.events).values({ id: "evt_nopost", title: "t", mainSourceId: "src_a" });
    expect(await getOrExtractFulltext("evt_nopost", getDb(), NOW)).toEqual({ status: "unavailable", text: null, blocks: null });
  });
});
