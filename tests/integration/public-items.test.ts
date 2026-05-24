// Integration test for the public items query against real Postgres (decision H).
// Covers selected/all modes, semantic windows, level/category/q filters, and keyset
// cursor pagination (no overlap, terminates).

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let listPublicItems: typeof import("@/db/queries/public-items").listPublicItems;
let parsePublicQuery: typeof import("@/public/query").parsePublicQuery;

const SOURCE_ID = "src_pub";
const NOW = new Date("2026-05-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const query = (qs: string) => parsePublicQuery(new URLSearchParams(qs));

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    pgHandle = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pgHandle.connectionString;
  }
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ listPublicItems } = await import("@/db/queries/public-items"));
  ({ parsePublicQuery } = await import("@/public/query"));

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
    })
    .onConflictDoNothing({ target: schema.sources.id });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.events);
});

async function insertEvent(opts: {
  id: string;
  title: string;
  category?: string;
  tags?: string[];
  level?: "none" | "B" | "A" | "S";
  promotedAt?: Date | null;
  publishedAt: Date;
}): Promise<void> {
  const { id, title, category, tags = [], level = "none", promotedAt = null, publishedAt } = opts;
  await getDb().insert(schema.events).values({
    id,
    title,
    category,
    tags,
    selectedLevel: level,
    selectedLabel: level === "none" ? null : level,
    promotedAt,
    publishedAt,
    mainSourceId: SOURCE_ID,
    qualityScore: 80,
  });
}

describe("listPublicItems (real Postgres)", () => {
  test("selected mode returns only selected events within the window, newest-promoted first", async () => {
    await insertEvent({ id: "e_b", title: "B event", level: "B", promotedAt: ago(0.5), publishedAt: ago(0.6) });
    await insertEvent({ id: "e_a", title: "A event", level: "A", promotedAt: ago(2), publishedAt: ago(2) });
    await insertEvent({ id: "e_old", title: "old S", level: "S", promotedAt: ago(20), publishedAt: ago(20) });
    await insertEvent({ id: "e_none", title: "not selected", level: "none", publishedAt: ago(0.2) });

    const res = await listPublicItems(query("mode=selected&since=week"), NOW);
    expect(res.items.map((i) => i.id)).toEqual(["e_b", "e_a"]); // e_old outside 7d, e_none not selected
    expect(res.items[0]!.selected_label).toBe("B");
  });

  test("level filter narrows to a single tier", async () => {
    await insertEvent({ id: "b1", title: "b", level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    await insertEvent({ id: "s1", title: "s", level: "S", promotedAt: ago(1), publishedAt: ago(1) });
    const res = await listPublicItems(query("mode=selected&since=month&level=S"), NOW);
    expect(res.items.map((i) => i.id)).toEqual(["s1"]);
  });

  test("category filter", async () => {
    await insertEvent({ id: "m", title: "model", category: "模型", level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    await insertEvent({ id: "p", title: "product", category: "产品", level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    const res = await listPublicItems(query("mode=selected&since=week&category=模型"), NOW);
    expect(res.items.map((i) => i.id)).toEqual(["m"]);
  });

  test("server-side q matches title, tags, and source name", async () => {
    await insertEvent({ id: "t1", title: "GPT 新模型", level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    await insertEvent({ id: "t2", title: "无关", tags: ["gpt-tag"], level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    await insertEvent({ id: "t3", title: "别的", level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    const res = await listPublicItems(query("mode=selected&since=week&q=gpt"), NOW);
    const ids = res.items.map((i) => i.id).sort();
    expect(ids).toEqual(["t1", "t2"]); // t3 has no gpt; source "OpenAI Blog" doesn't match "gpt"
  });

  test("all mode returns every event by effective time, ignoring selection", async () => {
    await insertEvent({ id: "a1", title: "newest", publishedAt: ago(0.1) });
    await insertEvent({ id: "a2", title: "middle", level: "S", promotedAt: ago(1), publishedAt: ago(1) });
    await insertEvent({ id: "a3", title: "oldest", publishedAt: ago(3) });
    const res = await listPublicItems(query("mode=all"), NOW);
    expect(res.items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
  });

  test("cursor pagination walks all selected items without overlap and terminates", async () => {
    for (let i = 0; i < 5; i++) {
      await insertEvent({
        id: `c${i}`,
        title: `c${i}`,
        level: "B",
        promotedAt: ago(i + 1), // strictly decreasing -> deterministic order c0..c4
        publishedAt: ago(i + 1),
      });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const qs = `mode=selected&since=month&take=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await listPublicItems(query(qs), NOW);
      seen.push(...res.items.map((i) => i.id));
      if (!res.next_cursor) break;
      cursor = res.next_cursor;
    }

    expect(seen).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(new Set(seen).size).toBe(5); // no overlap
  });

  test("GET /api/public/items route returns JSON with CDN cache headers", async () => {
    await insertEvent({ id: "r1", title: "routed", level: "B", promotedAt: ago(1), publishedAt: ago(1) });
    const { GET } = await import("@/app/api/public/items/route");

    const res = await GET(new Request("http://localhost/api/public/items?mode=selected&since=week"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");

    const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });
});
