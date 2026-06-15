// Integration test for the topic-board HTTP routes (v0.5 A1.2) against real Postgres.
// Drives the route handlers directly with crafted Requests carrying distinct signed `rid`
// cookies (two anonymous identities — getSession returns null outside a request context, so
// the cookie path is exercised). Asserts CRUD + owner isolation + status codes over the wire.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let mintReaderId: typeof import("@/auth/reader-id").mintReaderId;
let boardsRoute: typeof import("@/app/api/boards/route");
let boardIdRoute: typeof import("@/app/api/boards/[id]/route");

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

function req(token: string, init: { method: string; json?: unknown } ): Request {
  const headers = new Headers({ cookie: `rid=${token}` });
  let body: string | undefined;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  return new Request("http://localhost/api/boards", { method: init.method, headers, body });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  ({ mintReaderId } = await import("@/auth/reader-id"));
  boardsRoute = await import("@/app/api/boards/route");
  boardIdRoute = await import("@/app/api/boards/[id]/route");
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.topicBoards);
});

describe("board HTTP routes", () => {
  test("create → list → owner isolation → update → delete", async () => {
    const tokenA = await mintReaderId();
    const tokenB = await mintReaderId();

    const createRes = await boardsRoute.POST(
      req(tokenA, { method: "POST", json: { name: "智能体", tags: ["agent"] } }),
    );
    expect(createRes.status).toBe(201);
    const board = (await createRes.json()).board as { id: string; tags: string[] };
    expect(board.id).toMatch(/^tb_/);
    expect(board.tags).toEqual(["agent"]);

    const listA = await boardsRoute.GET(req(tokenA, { method: "GET" }));
    expect(listA.status).toBe(200);
    expect((await listA.json()).boards).toHaveLength(1);

    const listB = await boardsRoute.GET(req(tokenB, { method: "GET" }));
    expect((await listB.json()).boards).toHaveLength(0);

    const patchB = await boardIdRoute.PATCH(
      req(tokenB, { method: "PATCH", json: { name: "x" } }),
      params(board.id),
    );
    expect(patchB.status).toBe(404);

    const patchA = await boardIdRoute.PATCH(
      req(tokenA, { method: "PATCH", json: { tags: ["agent", "rag"] } }),
      params(board.id),
    );
    expect(patchA.status).toBe(200);
    expect((await patchA.json()).board.tags).toEqual(["agent", "rag"]);

    const delB = await boardIdRoute.DELETE(req(tokenB, { method: "DELETE" }), params(board.id));
    expect(delB.status).toBe(404);
    const delA = await boardIdRoute.DELETE(req(tokenA, { method: "DELETE" }), params(board.id));
    expect(delA.status).toBe(204);

    const listAfter = await boardsRoute.GET(req(tokenA, { method: "GET" }));
    expect((await listAfter.json()).boards).toHaveLength(0);
  });

  test("duplicate name returns 409 name_conflict", async () => {
    const token = await mintReaderId();
    await boardsRoute.POST(req(token, { method: "POST", json: { name: "Research", tags: [] } }));
    const dup = await boardsRoute.POST(req(token, { method: "POST", json: { name: "research", tags: [] } }));
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe("name_conflict");
  });

  test("invalid body (missing name) returns 400", async () => {
    const token = await mintReaderId();
    const res = await boardsRoute.POST(req(token, { method: "POST", json: { tags: ["x"] } }));
    expect(res.status).toBe(400);
  });

  test("a board can carry sourceIds (source scope) and round-trips normalized", async () => {
    const token = await mintReaderId();
    const res = await boardsRoute.POST(
      req(token, { method: "POST", json: { name: "源板", tags: [], sourceIds: ["src_a", "src_a", " src_b "] } }),
    );
    expect(res.status).toBe(201);
    const board = (await res.json()).board as { sourceIds: string[] };
    expect(board.sourceIds).toEqual(["src_a", "src_b"]);
  });
});
