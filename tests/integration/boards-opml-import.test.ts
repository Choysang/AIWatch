// Integration test for OPML import (v0.5 A4.2): POST /api/boards/opml-import over real
// Postgres. Verifies each parsed feed becomes a submitted source_recommendation contribution
// (the curated-pool intake), and the empty / no-feed guards. Identity falls back to anonymous
// fingerprint outside a Next request context — correct.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let importRoute: typeof import("@/app/api/boards/opml-import/route");

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

function post(body: string): Request {
  return new Request("http://localhost/api/boards/opml-import", {
    method: "POST",
    headers: { "content-type": "text/x-opml" },
    body,
  });
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  importRoute = await import("@/app/api/boards/opml-import/route");
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.contributions);
});

describe("OPML import route", () => {
  test("each feed becomes a submitted source_recommendation contribution", async () => {
    const opml = `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="官方" title="官方">
        <outline type="rss" text="OpenAI" xmlUrl="https://openai.example/feed.xml" htmlUrl="https://openai.example" />
      </outline>
      <outline type="rss" text="Simon" xmlUrl="https://simon.example/atom" />
    </body></opml>`;

    const res = await importRoute.POST(post(opml));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ submitted: 2, total: 2 });

    const rows = await getDb().select().from(schema.contributions);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.kind).toBe("source_recommendation");
      expect(row.targetType).toBe("source");
      expect(row.status).toBe("submitted");
    }
    const urls = rows.map((r) => (r.proposedChange as { url: string }).url).sort();
    expect(urls).toEqual(["https://openai.example/feed.xml", "https://simon.example/atom"]);
  });

  test("returns 422 when the document has no subscribable feeds", async () => {
    const res = await importRoute.POST(post(`<opml><body><outline text="Folder only" /></body></opml>`));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("no_feeds");
    expect(await getDb().select().from(schema.contributions)).toHaveLength(0);
  });

  test("returns 400 on an empty body", async () => {
    const res = await importRoute.POST(post("   "));
    expect(res.status).toBe(400);
  });
});
