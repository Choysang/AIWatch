// Integration test for the topic-boards query layer (v0.5 A1) against real Postgres.
// Covers: identity-scoped CRUD (owner isolation), per-identity case-insensitive unique
// name, board/tag limits, input normalization, the XOR identity guard, the userId path,
// the migration-level DB constraints (num_nonnulls XOR + partial unique indexes), and the
// listPopularTags vocabulary query. Error paths use try/catch (bun:test .rejects can hang).

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let boards: typeof import("@/db/queries/topic-boards");
let listPopularTags: typeof import("@/db/queries/tags").listPopularTags;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

/** Assert the async call rejects with an Error whose `.name` matches (our custom errors). */
async function expectReject(fn: () => Promise<unknown>, name: string): Promise<void> {
  let caught: Error | undefined;
  try {
    await fn();
  } catch (e) {
    caught = e as Error;
  }
  expect(caught?.name).toBe(name);
}

/** Assert the async call throws anything (for raw DB-constraint violations). */
async function expectThrows(fn: () => Promise<unknown>): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

const USER_A = { userId: "usr_a", fingerprint: null } as const;
const FP_A = { userId: null, fingerprint: "fp_a" } as const;
const FP_B = { userId: null, fingerprint: "fp_b" } as const;

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  boards = await import("@/db/queries/topic-boards");
  ({ listPopularTags } = await import("@/db/queries/tags"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.user)
    .values({ id: "usr_a", name: "A", email: "a@test.local" })
    .onConflictDoNothing();
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.topicBoards);
  await getDb().delete(schema.events);
});

describe("topic boards", () => {
  test("create + list are scoped to the owning identity", async () => {
    const a1 = await boards.createBoard(FP_A, { name: "智能体", tags: ["agent", "rag"] });
    expect(a1.id).toMatch(/^tb_/);
    expect(a1.tags).toEqual(["agent", "rag"]);

    expect((await boards.listBoards(FP_A)).map((b) => b.name)).toEqual(["智能体"]);
    expect(await boards.listBoards(FP_B)).toEqual([]);
  });

  test("getBoard / updateBoard / deleteBoard reject non-owners", async () => {
    const a1 = await boards.createBoard(FP_A, { name: "多模态", tags: ["vision"] });

    expect(await boards.getBoard(FP_B, a1.id)).toBeNull();
    await expectReject(() => boards.updateBoard(FP_B, a1.id, { name: "x" }), "BoardNotFoundError");
    await expectReject(() => boards.deleteBoard(FP_B, a1.id), "BoardNotFoundError");

    const upd = await boards.updateBoard(FP_A, a1.id, { name: "多模态AI", tags: ["vision", "sora"] });
    expect(upd.name).toBe("多模态AI");
    expect(upd.tags).toEqual(["vision", "sora"]);

    await boards.deleteBoard(FP_A, a1.id);
    expect(await boards.getBoard(FP_A, a1.id)).toBeNull();
  });

  test("rejects a duplicate name (case-insensitive) within one identity, allows across identities", async () => {
    await boards.createBoard(FP_A, { name: "Research", tags: [] });
    await expectReject(() => boards.createBoard(FP_A, { name: "research", tags: [] }), "BoardNameConflictError");

    const b = await boards.createBoard(FP_B, { name: "research", tags: [] });
    expect(b.name).toBe("research");
  });

  test("enforces the per-identity board limit", async () => {
    for (let i = 0; i < boards.MAX_BOARDS_PER_IDENTITY; i++) {
      await boards.createBoard(FP_A, { name: `b${i}`, tags: [] });
    }
    await expectReject(() => boards.createBoard(FP_A, { name: "one-too-many", tags: [] }), "BoardLimitError");
  });

  test("normalizes name (whitespace) and tags (trim, dedupe, cap)", async () => {
    const b = await boards.createBoard(FP_A, {
      name: "  spaced   name  ",
      tags: [" agent ", "agent", "", "rag"],
    });
    expect(b.name).toBe("spaced name");
    expect(b.tags).toEqual(["agent", "rag"]);

    const many = Array.from({ length: 25 }, (_, i) => `t${i}`);
    const c = await boards.createBoard(FP_A, { name: "many", tags: many });
    expect(c.tags).toHaveLength(boards.MAX_TAGS_PER_BOARD);
  });

  test("rejects an empty or ambiguous identity, and an empty name", async () => {
    await expectReject(
      () => boards.createBoard({ userId: null, fingerprint: null }, { name: "x", tags: [] }),
      "BoardIdentityError",
    );
    await expectReject(
      () => boards.createBoard({ userId: "usr_a", fingerprint: "fp_a" }, { name: "x", tags: [] }),
      "BoardIdentityError",
    );
    await expectReject(() => boards.createBoard(FP_A, { name: "   ", tags: [] }), "EmptyBoardNameError");
  });

  test("userId-owned boards are isolated from fingerprint identities", async () => {
    const ub = await boards.createBoard(USER_A, { name: "owner board", tags: ["llm"] });
    expect(await boards.getBoard(USER_A, ub.id)).not.toBeNull();
    expect(await boards.getBoard(FP_A, ub.id)).toBeNull();
  });

  test("DB constraints enforce XOR identity + per-identity unique name", async () => {
    // both-null and both-set both violate the num_nonnulls(...) = 1 CHECK.
    await expectThrows(() =>
      getDb().insert(schema.topicBoards).values({ id: "tb_x1", userId: null, fingerprint: null, name: "x" }),
    );
    await expectThrows(() =>
      getDb().insert(schema.topicBoards).values({ id: "tb_x2", userId: "usr_a", fingerprint: "fp_a", name: "x" }),
    );
    // duplicate lower(name) for the same fingerprint violates the partial unique index.
    await getDb().insert(schema.topicBoards).values({ id: "tb_u1", fingerprint: "fp_dup", name: "Dup" });
    await expectThrows(() =>
      getDb().insert(schema.topicBoards).values({ id: "tb_u2", fingerprint: "fp_dup", name: "dup" }),
    );
  });

  test("listPopularTags returns emergent tags ordered by frequency", async () => {
    await getDb()
      .insert(schema.events)
      .values([
        { id: "evt_1", title: "a", tags: ["agent", "rag"] },
        { id: "evt_2", title: "b", tags: ["agent"] },
        { id: "evt_3", title: "c", tags: ["vision", "agent"] },
      ]);
    const tags = await listPopularTags(10);
    expect(tags[0]).toEqual({ tag: "agent", count: 3 });
    const byName = Object.fromEntries(tags.map((t) => [t.tag, t.count]));
    expect(byName.rag).toBe(1);
    expect(byName.vision).toBe(1);
  });
});
