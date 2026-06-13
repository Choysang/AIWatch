// Integration test for the X-source health alert (TWITTER_AUTH_TOKEN-expired signature).
// Exercises: below-threshold quiet, no-recipient skip, cooldown dedupe via audit_logs, and
// the happy path (email sent + audit row written) with a stubbed Resend fetch.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let alert: typeof import("@/db/jobs/alert-source-health");

const realFetch = globalThis.fetch;
const savedEnv: Record<string, string | undefined> = {};

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  for (const k of ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "SOURCE_ALERT_EMAIL"]) savedEnv[k] = process.env[k];
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  alert = await import("@/db/jobs/alert-source-health");
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

let xSeq = 0;
async function seedXSource(status: "healthy" | "degraded" | "disabled"): Promise<void> {
  xSeq += 1;
  await getDb().insert(schema.sources).values({
    id: `src_x_${xSeq}`,
    platform: "x",
    name: `X 源 ${xSeq}`,
    sourceType: "kol",
    level: "L3",
    connectorType: "rsshub",
    healthStatus: status,
    failureCount: status === "healthy" ? 0 : 38,
  });
}

beforeEach(async () => {
  await getDb().delete(schema.auditLogs);
  await getDb().delete(schema.sources);
  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_EMAIL_FROM;
  delete process.env.SOURCE_ALERT_EMAIL;
});

describe("alertSourceHealth", () => {
  test("stays quiet when fewer than the threshold of X sources are failing", async () => {
    await seedXSource("disabled");
    await seedXSource("healthy");

    const result = await alert.alertSourceHealth(getDb());
    expect(result.triggered).toBe(false);
    expect(result.skipped).toBe("below_threshold");
  });

  test("triggers but cannot notify when SOURCE_ALERT_EMAIL is unset", async () => {
    await seedXSource("disabled");
    await seedXSource("disabled");
    await seedXSource("degraded");

    const result = await alert.alertSourceHealth(getDb());
    expect(result).toMatchObject({ failingXCount: 3, triggered: true, emailSent: false, skipped: "no_recipient" });
    expect(await getDb().select().from(schema.auditLogs)).toHaveLength(0);
  });

  test("emails the operator and records an audit row on the happy path", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_EMAIL_FROM = "alerts@aiwatch.test";
    process.env.SOURCE_ALERT_EMAIL = "ops@example.com";
    for (let i = 0; i < 3; i++) await seedXSource("disabled");

    let captured: { to?: string; subject?: string } = {};
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      captured = { to: body.to, subject: body.subject };
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await alert.alertSourceHealth(getDb());
    expect(result).toMatchObject({ failingXCount: 3, triggered: true, emailSent: true, skipped: null });
    expect(captured.to).toBe("ops@example.com");
    expect(captured.subject).toContain("X 信源");

    const audits = await getDb().select().from(schema.auditLogs);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("source_health_alert");
  });

  test("does not re-email within the cooldown window", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_EMAIL_FROM = "alerts@aiwatch.test";
    process.env.SOURCE_ALERT_EMAIL = "ops@example.com";
    for (let i = 0; i < 3; i++) await seedXSource("disabled");
    await getDb().insert(schema.auditLogs).values({
      id: "aud_recent",
      action: "source_health_alert",
      targetType: "source",
    });

    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await alert.alertSourceHealth(getDb());
    expect(result.skipped).toBe("cooldown");
    expect(result.emailSent).toBe(false);
    expect(fetchCalled).toBe(false);
  });
});
