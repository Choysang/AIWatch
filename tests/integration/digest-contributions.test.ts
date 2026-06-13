// Integration test for the hourly contribution digest job (信源推荐收集 slice B).
// Exercises: owner/admin get notified about newly submitted contributions, plain
// users don't, an empty hour produces nothing, and the stateless dedupe (only
// contributions newer than the recipient's last digest) never re-notifies.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let authSchema: typeof import("@/db/auth-schema");
let digest: typeof import("@/db/jobs/digest-contributions");

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
  authSchema = await import("@/db/auth-schema");
  digest = await import("@/db/jobs/digest-contributions");
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

async function seedUser(id: string, role: string): Promise<void> {
  await getDb().insert(authSchema.user).values({
    id,
    name: id,
    email: `${id}@test.local`,
    role,
  });
}

async function seedContribution(id: string): Promise<void> {
  await getDb().insert(schema.contributions).values({
    id,
    kind: "source_recommendation",
    targetType: "source",
    proposedChange: { name: "好信源", url: "https://example.com/feed" },
    reason: "想看这个",
  });
}

beforeEach(async () => {
  await getDb().delete(schema.notifications);
  await getDb().delete(schema.contributions);
  await getDb().delete(authSchema.user);
});

describe("digestPendingContributions", () => {
  test("notifies owner and admin about new submissions, not plain users", async () => {
    await seedUser("usr_owner", "owner");
    await seedUser("usr_admin", "admin");
    await seedUser("usr_plain", "user");
    await seedContribution("ctb_1");
    await seedContribution("ctb_2");

    const result = await digest.digestPendingContributions(getDb());

    expect(result).toEqual({ recipients: 2, notified: 2, pendingTotal: 2 });
    const rows = await getDb().select().from(schema.notifications);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set(["usr_owner", "usr_admin"]));
    for (const row of rows) {
      expect(row.kind).toBe("contribution_digest");
      expect(row.title).toContain("2 条新的信源推荐");
    }
  });

  test("does nothing when there are no submissions", async () => {
    await seedUser("usr_owner", "owner");

    const result = await digest.digestPendingContributions(getDb());

    expect(result).toEqual({ recipients: 1, notified: 0, pendingTotal: 0 });
    expect(await getDb().select().from(schema.notifications)).toHaveLength(0);
  });

  test("does not re-notify for already-digested submissions; counts only newer ones", async () => {
    await seedUser("usr_owner", "owner");
    await seedContribution("ctb_old");

    await digest.digestPendingContributions(getDb());
    const second = await digest.digestPendingContributions(getDb());
    expect(second.notified).toBe(0);

    // A submission created after the first digest triggers exactly one more
    // notification, counting only the new row (pending total still includes both).
    await seedContribution("ctb_new");
    const third = await digest.digestPendingContributions(getDb());
    expect(third).toEqual({ recipients: 1, notified: 1, pendingTotal: 2 });

    const rows = await getDb()
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, "usr_owner"));
    expect(rows).toHaveLength(2);
    const latest = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    expect(latest?.title).toContain("1 条新的信源推荐");
  });
});
