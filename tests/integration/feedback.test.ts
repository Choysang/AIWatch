// Integration test for the anonymous feedback write path against real Postgres. Validation
// lives in src/feedback/schema.ts (unit-tested); this verifies the row lands with the right
// columns, including the optional contact and the abuse-triage fingerprint.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let createFeedback: typeof import("@/db/queries/feedback").createFeedback;

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
  ({ createFeedback } = await import("@/db/queries/feedback"));
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.feedback);
});

describe("createFeedback (real Postgres)", () => {
  test("persists body + contact + fingerprint and returns the id", async () => {
    const { id } = await createFeedback(
      { body: "希望加暗色模式", contact: "me@example.com" },
      "fp_abc",
      getDb(),
    );
    expect(id.startsWith("fbk_")).toBe(true);
    const rows = await getDb().select().from(schema.feedback);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe("希望加暗色模式");
    expect(rows[0]!.contact).toBe("me@example.com");
    expect(rows[0]!.fingerprint).toBe("fp_abc");
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });

  test("stores null contact + null fingerprint for a bare anonymous submission", async () => {
    await createFeedback({ body: "纯匿名一条", contact: undefined }, null, getDb());
    const rows = await getDb().select().from(schema.feedback);
    expect(rows[0]!.contact).toBeNull();
    expect(rows[0]!.fingerprint).toBeNull();
  });
});
