// Integration tests for direct-push and strong-signal timestamp behavior.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let directPush: typeof import("@/db/jobs/direct-push").directPushEvent;
let DirectPushForbiddenError: typeof import("@/db/jobs/direct-push").DirectPushForbiddenError;
let addReaction: typeof import("@/db/queries/reactions").addReaction;
let addComment: typeof import("@/db/queries/comments").addComment;

const SOURCE_ID = "src_scoring_int";
const NOW = new Date("2026-05-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

async function expectRejection(
  p: Promise<unknown>,
  type: new (...args: never[]) => Error,
): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(type);
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  const directModule = await import("@/db/jobs/direct-push");
  directPush = directModule.directPushEvent;
  DirectPushForbiddenError = directModule.DirectPushForbiddenError;
  ({ addReaction } = await import("@/db/queries/reactions"));
  ({ addComment } = await import("@/db/queries/comments"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "Scoring Integrity Source",
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
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.auditLogs);
  await getDb().delete(schema.eventComments);
  await getDb().delete(schema.eventReactions);
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.user);
});

async function seedScoredEvent(opts: {
  id: string;
  baseScore: number;
  publishedAt?: Date;
  category?: string;
  level?: "none" | "B" | "A" | "S";
}): Promise<void> {
  const publishedAt = opts.publishedAt ?? ago(0.5);
  const jId = `ej_${opts.id}`;
  const sId = `es_${opts.id}`;
  await getDb().insert(schema.events).values({
    id: opts.id,
    title: opts.id,
    category: opts.category ?? null,
    mainSourceId: SOURCE_ID,
    publishedAt,
    lastStrongSignalAt: publishedAt,
    selectedLevel: opts.level ?? "none",
  });
  await getDb().insert(schema.eventJudgments).values({
    id: jId,
    eventId: opts.id,
    provider: "stub",
    modelId: "stub",
    promptVersion: "p",
    routingConfigVersion: "r",
    aiRelevance: 80,
    impact: 70,
    novelty: 60,
    audienceUsefulness: 65,
    evidenceClarity: 75,
  });
  await getDb().insert(schema.eventScores).values({
    id: sId,
    eventId: opts.id,
    scoringConfigVersion: "scoring-v1",
    judgmentId: jId,
    baseScore: opts.baseScore,
    qualityScore: opts.baseScore,
    rankScore: opts.baseScore,
    displayScore: Math.round(opts.baseScore),
    breakdown: {},
  });
  await getDb()
    .update(schema.events)
    .set({ currentScoreId: sId, currentJudgmentId: jId })
    .where(eq(schema.events.id, opts.id));
}

async function seedExpertUser(opts: {
  id: string;
  role: "expert" | "moderator" | "admin" | "user";
  weight?: number;
  domains?: string[];
}): Promise<string> {
  await getDb().insert(schema.user).values({
    id: opts.id,
    name: opts.id,
    email: `${opts.id}@example.com`,
    emailVerified: true,
    role: opts.role,
    expertWeight: opts.weight ?? 1,
    expertDomain: opts.domains ?? [],
    createdAt: ago(30),
    updatedAt: ago(30),
  });
  return opts.id;
}

describe("directPushEvent (real Postgres)", () => {
  test("stamps flag, writes audit row, re-arms last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "to_push", baseScore: 60 });

    const r = await directPush(
      "to_push",
      { id: "u_admin", role: "admin" },
      "promoting clearly important item",
    );
    expect(r.alreadyPushed).toBe(false);

    const ev = (
      await getDb()
        .select({
          pushAt: schema.events.expertDirectPushAt,
          pushBy: schema.events.expertDirectPushBy,
          lastSig: schema.events.lastStrongSignalAt,
        })
        .from(schema.events)
        .where(eq(schema.events.id, "to_push"))
    )[0]!;
    expect(ev.pushAt).not.toBeNull();
    expect(ev.pushBy).toBe("u_admin");
    expect(ev.lastSig).not.toBeNull();

    const audits = await getDb()
      .select({ action: schema.auditLogs.action, actorId: schema.auditLogs.actorId })
      .from(schema.auditLogs);
    expect(audits.some((a) => a.action === "event.directPush" && a.actorId === "u_admin")).toBe(true);
  });

  test("is idempotent: re-pushing returns alreadyPushed without extra audit", async () => {
    await seedScoredEvent({ id: "idempot", baseScore: 60 });

    await directPush("idempot", { id: "u_admin", role: "admin" }, undefined);
    const r2 = await directPush("idempot", { id: "u_admin", role: "admin" }, undefined);
    expect(r2.alreadyPushed).toBe(true);

    const audits = await getDb()
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs);
    expect(audits.length).toBe(1);
  });

  test("rejects callers without event.directPush capability", async () => {
    await seedScoredEvent({ id: "guarded", baseScore: 60 });
    await expectRejection(
      directPush("guarded", { id: "u_reader", role: "user" }, undefined),
      DirectPushForbiddenError,
    );
    const ev = (
      await getDb()
        .select({ pushAt: schema.events.expertDirectPushAt })
        .from(schema.events)
        .where(eq(schema.events.id, "guarded"))
    )[0]!;
    expect(ev.pushAt).toBeNull();
  });
});

describe("signal updates last_strong_signal_at (real Postgres)", () => {
  async function readLastSig(eventId: string): Promise<Date> {
    const row = (
      await getDb()
        .select({ lastSig: schema.events.lastStrongSignalAt })
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
    )[0]!;
    return row.lastSig!;
  }

  test("named-user star resets last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "star_named", baseScore: 80 });
    await seedExpertUser({ id: "u_star_named", role: "user" });
    const before = await readLastSig("star_named");

    await addReaction(
      { eventId: "star_named", kind: "star", identity: { userId: "u_star_named", fingerprint: null } },
      getDb(),
    );

    const after = await readLastSig("star_named");
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  test("anonymous star does NOT reset last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "star_anon", baseScore: 80 });
    const before = await readLastSig("star_anon");

    await addReaction(
      { eventId: "star_anon", kind: "star", identity: { userId: null, fingerprint: "fp_anon_test_001" } },
      getDb(),
    );

    const after = await readLastSig("star_anon");
    expect(after.getTime()).toBe(before.getTime());
  });

  test("plain like does NOT reset last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "like_named", baseScore: 80 });
    await seedExpertUser({ id: "u_liker", role: "user" });
    const before = await readLastSig("like_named");

    await addReaction(
      { eventId: "like_named", kind: "like", identity: { userId: "u_liker", fingerprint: null } },
      getDb(),
    );

    const after = await readLastSig("like_named");
    expect(after.getTime()).toBe(before.getTime());
  });

  test("expert valid comment resets last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "cmt_expert", baseScore: 80 });
    await seedExpertUser({ id: "u_cmt_expert", role: "expert" });
    const before = await readLastSig("cmt_expert");

    await addComment(
      {
        eventId: "cmt_expert",
        body: "The architectural decision here is interesting — combining attention routing with sparse activations reduces compute significantly while preserving model quality.",
        identity: { userId: "u_cmt_expert", fingerprint: null },
      },
      getDb(),
    );

    const after = await readLastSig("cmt_expert");
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  test("non-expert valid comment does NOT reset last_strong_signal_at", async () => {
    await seedScoredEvent({ id: "cmt_reader", baseScore: 80 });
    await seedExpertUser({ id: "u_cmt_reader", role: "user" });
    const before = await readLastSig("cmt_reader");

    await addComment(
      {
        eventId: "cmt_reader",
        body: "The architectural decision here is interesting — combining attention routing with sparse activations reduces compute significantly while preserving model quality.",
        identity: { userId: "u_cmt_reader", fingerprint: null },
      },
      getDb(),
    );

    const after = await readLastSig("cmt_reader");
    expect(after.getTime()).toBe(before.getTime());
  });
});
