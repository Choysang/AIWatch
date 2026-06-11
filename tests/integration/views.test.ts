import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let views: typeof import("@/db/queries/views");
let readerId: typeof import("@/auth/reader-id");

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
  views = await import("@/db/queries/views");
  readerId = await import("@/auth/reader-id");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.eventViews);
  await getDb().delete(schema.events);
  await getDb().delete(schema.sources);
});

async function seedSource(id = "src_views"): Promise<string> {
  await getDb().insert(schema.sources).values({
    id,
    name: id,
    platform: "blog",
    level: "L2",
    sourceType: "official",
    connectorType: "mock",
  });
  return id;
}

async function seedEvent(id: string): Promise<void> {
  const sourceId = await seedSource();
  await getDb().insert(schema.events).values({
    id,
    title: id,
    mainSourceId: sourceId,
  });
}

async function readViewCount(id: string): Promise<number> {
  const rows = await getDb()
    .select({ viewCount: schema.events.viewCount })
    .from(schema.events)
    .where(eq(schema.events.id, id));
  return rows[0]!.viewCount;
}

describe("event views (real Postgres)", () => {
  test("recordEventView is idempotent for the same event and anonymous fingerprint", async () => {
    await seedEvent("evt_view_dup");

    const first = await views.recordEventView({
      eventId: "evt_view_dup",
      identity: { userId: null, fingerprint: "fp_same" },
    });
    expect(first.viewCount).toBe(1);
    expect(first.counted).toBe(true);

    const second = await views.recordEventView({
      eventId: "evt_view_dup",
      identity: { userId: null, fingerprint: "fp_same" },
    });
    expect(second.viewCount).toBe(1);
    expect(second.counted).toBe(false);
    expect(await readViewCount("evt_view_dup")).toBe(1);
  });

  test("recordEventView counts distinct anonymous fingerprints", async () => {
    await seedEvent("evt_view_distinct");

    await views.recordEventView({
      eventId: "evt_view_distinct",
      identity: { userId: null, fingerprint: "fp_one" },
    });
    const second = await views.recordEventView({
      eventId: "evt_view_distinct",
      identity: { userId: null, fingerprint: "fp_two" },
    });

    expect(second.viewCount).toBe(2);
    expect(second.counted).toBe(true);
  });

  test("views POST dedupes repeated requests from the same reader cookie", async () => {
    await seedEvent("evt_view_route");
    const token = await readerId.mintReaderId();
    const { POST } = await import("@/app/api/events/[id]/views/route");

    const first = await POST(
      new Request("http://localhost/api/events/evt_view_route/views", {
        method: "POST",
        headers: {
          cookie: `${readerId.READER_ID_COOKIE}=${token}`,
          "content-type": "application/json",
          "user-agent": "views-test",
          "x-real-ip": "203.0.113.10",
        },
        body: JSON.stringify({ kind: "detail" }),
      }),
      { params: Promise.resolve({ id: "evt_view_route" }) },
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ viewCount: 1 });

    const second = await POST(
      new Request("http://localhost/api/events/evt_view_route/views", {
        method: "POST",
        headers: {
          cookie: `${readerId.READER_ID_COOKIE}=${token}`,
          "content-type": "application/json",
          "user-agent": "views-test",
          "x-real-ip": "203.0.113.10",
        },
        body: JSON.stringify({ kind: "detail" }),
      }),
      { params: Promise.resolve({ id: "evt_view_route" }) },
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ viewCount: 1 });
    expect(await readViewCount("evt_view_route")).toBe(1);
  });

  test("views POST dedupes repeated direct requests with the same IP and user agent", async () => {
    await seedEvent("evt_view_direct");
    const { POST } = await import("@/app/api/events/[id]/views/route");

    const requestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "direct-view-test",
        "x-real-ip": "203.0.113.20",
      },
      body: JSON.stringify({ kind: "source" }),
    };

    const first = await POST(
      new Request("http://localhost/api/events/evt_view_direct/views", requestInit),
      { params: Promise.resolve({ id: "evt_view_direct" }) },
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ viewCount: 1 });

    const second = await POST(
      new Request("http://localhost/api/events/evt_view_direct/views", requestInit),
      { params: Promise.resolve({ id: "evt_view_direct" }) },
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ viewCount: 1 });
    expect(await readViewCount("evt_view_direct")).toBe(1);
  });
});
