// Integration test for the LLM pipeline alert. When judge failures spike, posts may be
// stored without events; this verifies the alert is visible, deduped, and email-backed.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let alert: typeof import("@/db/jobs/alert-pipeline-health");

const SOURCE_ID = "src_pipeline_alert";
const realFetch = globalThis.fetch;
const savedEnv: Record<string, string | undefined> = {};

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  for (const k of ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "SOURCE_ALERT_EMAIL"]) {
    savedEnv[k] = process.env[k];
  }
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  alert = await import("@/db/jobs/alert-pipeline-health");
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

let postSeq = 0;
async function seedSource(): Promise<void> {
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      platform: "blog",
      name: "Pipeline Alert Source",
      sourceType: "official",
      level: "L2",
      connectorType: "rss",
      url: "https://example.com/feed.xml",
    })
    .onConflictDoNothing();
}

async function seedFailedPost(reason: string, ageMinutes = 5): Promise<void> {
  postSeq += 1;
  await getDb().insert(schema.posts).values({
    id: `post_pipeline_alert_${postSeq}`,
    sourceId: SOURCE_ID,
    platform: "blog",
    url: `https://example.com/${postSeq}`,
    rawTitle: `Pipeline failed ${postSeq}`,
    rawContent: "LLM judge failed before event creation.",
    judgeError: reason,
    judgeFailedAt: new Date(Date.now() - ageMinutes * 60 * 1000),
  });
}

beforeEach(async () => {
  await getDb().delete(schema.auditLogs);
  await getDb().delete(schema.posts);
  await getDb().delete(schema.sources);
  await seedSource();
  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_EMAIL_FROM;
  delete process.env.SOURCE_ALERT_EMAIL;
});

describe("alertPipelineHealth", () => {
  test("stays quiet when no recent LLM judge failures exist", async () => {
    await seedFailedPost("provider_error", 180);

    const result = await alert.alertPipelineHealth(getDb());
    expect(result).toMatchObject({
      failedCount: 0,
      triggered: false,
      emailSent: false,
      skipped: "no_failures",
    });
  });

  test("triggers but cannot notify when SOURCE_ALERT_EMAIL is unset", async () => {
    await seedFailedPost("provider_error");
    await seedFailedPost("no_key");

    const result = await alert.alertPipelineHealth(getDb());
    expect(result).toMatchObject({
      failedCount: 2,
      reasons: { provider_error: 1, no_key: 1 },
      triggered: true,
      emailSent: false,
      skipped: "no_recipient",
    });
    expect(await getDb().select().from(schema.auditLogs)).toHaveLength(0);
  });

  test("emails the operator and records an audit row on the happy path", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_EMAIL_FROM = "alerts@aiwatch.test";
    process.env.SOURCE_ALERT_EMAIL = "ops@example.com";
    await seedFailedPost("provider_error");

    let captured: { to?: string; subject?: string; text?: string } = {};
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      captured = { to: body.to, subject: body.subject, text: body.text };
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await alert.alertPipelineHealth(getDb());
    expect(result).toMatchObject({ failedCount: 1, triggered: true, emailSent: true, skipped: null });
    expect(captured.to).toBe("ops@example.com");
    expect(captured.subject).toContain("LLM 判定链路异常");
    expect(captured.text).toContain("provider_error: 1");

    const audits = await getDb().select().from(schema.auditLogs);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("pipeline_health_alert");
  });

  test("does not re-email within the cooldown window", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_EMAIL_FROM = "alerts@aiwatch.test";
    process.env.SOURCE_ALERT_EMAIL = "ops@example.com";
    await seedFailedPost("provider_error");
    await getDb().insert(schema.auditLogs).values({
      id: "aud_pipeline_recent",
      action: "pipeline_health_alert",
      targetType: "post",
    });

    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await alert.alertPipelineHealth(getDb());
    expect(result.skipped).toBe("cooldown");
    expect(result.emailSent).toBe(false);
    expect(fetchCalled).toBe(false);
  });
});
