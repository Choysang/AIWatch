// Integration test for OPML export (v0.5 A4.1): the GET /api/boards/opml route over real
// Postgres. Seeds a mix of sources and asserts only enabled, non-archived, RSS-family ones
// with a public feed URL appear in the OPML — and that the response is a proper download.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let opmlRoute: typeof import("@/app/api/boards/opml/route");

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
  opmlRoute = await import("@/app/api/boards/opml/route");
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.sources);
});

describe("OPML export route", () => {
  test("includes only enabled, non-archived RSS-family sources with a feed url", async () => {
    await getDb()
      .insert(schema.sources)
      .values([
        // exportable: rss + youtube_rss
        { id: "src_rss", name: "OpenAI Blog", platform: "blog", sourceType: "official", level: "L1", connectorType: "rss", connectorRef: "https://openai.example/feed.xml", url: "https://openai.example", categories: ["官方"] },
        { id: "src_yt", name: "Two Minute Papers", platform: "youtube", sourceType: "kol", level: "L2", connectorType: "youtube_rss", connectorRef: "https://youtube.com/feeds/videos.xml?channel_id=x", url: "https://youtube.com/@x", categories: ["专家"] },
        // excluded: archived
        { id: "src_arch", name: "Archived Blog", platform: "blog", sourceType: "official", level: "L1", connectorType: "rss", connectorRef: "https://archived.example/feed", archivedAt: new Date() },
        // excluded: disabled
        { id: "src_off", name: "Disabled Blog", platform: "blog", sourceType: "official", level: "L1", connectorType: "rss", connectorRef: "https://disabled.example/feed", enabled: false },
        // excluded: non-rss-family connector (rsshub / X) has no public xmlUrl
        { id: "src_x", name: "Some X Account", platform: "x", sourceType: "kol", level: "L2", connectorType: "rsshub", connectorRef: "/twitter/user/x", url: "https://x.com/x" },
      ]);

    const res = await opmlRoute.GET(new Request("http://localhost/api/boards/opml", { method: "GET" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-opml");
    expect(res.headers.get("content-disposition")).toContain("aiwatch-sources.opml");

    const body = await res.text();
    expect(body).toContain('<opml version="2.0">');
    // included
    expect(body).toContain("https://openai.example/feed.xml");
    expect(body).toContain("https://youtube.com/feeds/videos.xml?channel_id=x");
    expect(body).toContain('text="OpenAI Blog"');
    expect(body).toContain('<outline text="官方" title="官方">');
    // excluded
    expect(body).not.toContain("https://archived.example/feed");
    expect(body).not.toContain("https://disabled.example/feed");
    expect(body).not.toContain("/twitter/user/x");
  });

  test("exports an empty but valid document when there are no feeds", async () => {
    const res = await opmlRoute.GET(new Request("http://localhost/api/boards/opml", { method: "GET" }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<opml version="2.0">');
    expect(body).toContain("<body>");
    expect(body.trimEnd().endsWith("</opml>")).toBe(true);
  });
});
