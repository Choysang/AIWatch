// Integration test for the contribution lifecycle against real Postgres (decision H/14).
// Covers submit -> triage -> approve -> apply through the DB, RBAC enforcement, the review
// state machine, audit-row provenance, and that applying a source recommendation creates an
// enabled managed source.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let jobs: typeof import("@/db/jobs/contributions");
let parseSubmission: typeof import("@/contributions/schema").parseSubmission;
let listContributions: typeof import("@/db/queries/contributions").listContributions;
let listAuditLogs: typeof import("@/db/queries/audit").listAuditLogs;

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

const ADMIN = { id: "usr_admin", role: "admin" };
const MOD = { id: "usr_mod", role: "moderator" };
const PLAIN = { id: "usr_plain", role: "user" };

// Assert a promise rejects with the given error type. We use explicit try/catch instead of
// bun:test's `expect(p).rejects.toThrow()` because that matcher hangs (~indefinitely) here
// when the promise rejects *after* an awaited DB round-trip — a bun test-runner quirk, not a
// product bug (the same calls reject in ~10ms under `bun run`). try/catch observes the
// rejection deterministically. See ForbiddenError cases below, which reject synchronously and
// work with either style.
async function expectRejection(
  p: Promise<unknown>,
  type: new (...args: never[]) => Error = Error,
): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(type);
}

function recommendation() {
  return parseSubmission({
    kind: "source_recommendation",
    reason: "firsthand model announcements",
    proposedChange: { url: "https://example.com/feed.xml", name: "Example AI", categories: ["模型"] },
  });
}

beforeAll(async () => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  jobs = await import("@/db/jobs/contributions");
  ({ parseSubmission } = await import("@/contributions/schema"));
  ({ listContributions } = await import("@/db/queries/contributions"));
  ({ listAuditLogs } = await import("@/db/queries/audit"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.notifications);
  await getDb().delete(schema.auditLogs);
  await getDb().delete(schema.contributions);
  await getDb().delete(schema.sources);
});

describe("source_approved notification (SP3.3)", () => {
  test("applying a contribution from a logged-in recommender notifies them", async () => {
    const notifications = await import("@/db/queries/notifications");
    // Submitted while logged in → contributorUserId is captured.
    const { id } = await jobs.submitContribution(recommendation(), { userId: "usr_reco" }, getDb());
    await jobs.reviewContribution(id, "approve", ADMIN, undefined, getDb());
    await jobs.applyContribution(id, ADMIN, "importing", getDb());

    const list = await notifications.listNotifications("usr_reco");
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("source_approved");
    expect(list[0]!.body).toBe("Example AI");
    expect(list[0]!.targetType).toBe("source");
  });

  test("an anonymous recommendation produces no notification on apply", async () => {
    const notifications = await import("@/db/queries/notifications");
    const { id } = await jobs.submitContribution(recommendation(), { fingerprint: "fp_anon" }, getDb());
    await jobs.reviewContribution(id, "approve", ADMIN, undefined, getDb());
    await jobs.applyContribution(id, ADMIN, undefined, getDb());

    const all = await getDb().select().from(schema.notifications);
    expect(all.length).toBe(0);
  });
});

describe("submitContribution", () => {
  test("lands as `submitted` with an anonymous fingerprint and no audit row", async () => {
    const { id, status } = await jobs.submitContribution(
      recommendation(),
      { fingerprint: "fp_abc" },
      getDb(),
    );
    expect(status).toBe("submitted");

    const rows = await getDb().select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contributorFingerprint).toBe("fp_abc");
    expect(rows[0]!.contributorUserId).toBeNull();

    // Submission is not an admin action -> no audit entry.
    const audit = await listAuditLogs(100, getDb());
    expect(audit).toHaveLength(0);
  });
});

describe("review lifecycle", () => {
  test("triage -> approve -> apply walks the state machine and audits each step", async () => {
    const { id } = await jobs.submitContribution(recommendation(), { fingerprint: "fp1" }, getDb());

    const triaged = await jobs.reviewContribution(id, "triage", MOD, "looks plausible", getDb());
    expect(triaged.status).toBe("triaged");

    const approved = await jobs.reviewContribution(id, "approve", ADMIN, undefined, getDb());
    expect(approved.status).toBe("approved");

    const applied = await jobs.applyContribution(id, ADMIN, "importing", getDb());
    expect(applied.status).toBe("applied");
    expect(applied.appliedTargetId).toBeTruthy();

    // Apply created an enabled source pointing at the recommended feed.
    const src = await getDb()
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, applied.appliedTargetId!));
    expect(src).toHaveLength(1);
    expect(src[0]!.enabled).toBe(true);
    expect(src[0]!.url).toBe("https://example.com/feed.xml");
    expect(src[0]!.connectorRef).toBe("https://example.com/feed.xml");

    // Three admin actions -> three audit rows (triage, approve, apply).
    const audit = await listAuditLogs(100, getDb());
    const actions = audit.map((a) => a.action).sort();
    expect(actions).toEqual(["contribution.apply", "contribution.approve", "contribution.triage"]);
    const applyRow = audit.find((a) => a.action === "contribution.apply")!;
    expect(applyRow.targetType).toBe("source");
    expect(applyRow.targetId).toBe(applied.appliedTargetId);
    expect(applyRow.actorId).toBe(ADMIN.id);
  });
});

describe("RBAC enforcement", () => {
  test("a plain user cannot triage, approve, or apply", async () => {
    const { id } = await jobs.submitContribution(recommendation(), { fingerprint: "fp2" }, getDb());

    await expect(jobs.reviewContribution(id, "triage", PLAIN, undefined, getDb())).rejects.toThrow(
      jobs.ForbiddenError,
    );
    await expect(jobs.reviewContribution(id, "approve", PLAIN, undefined, getDb())).rejects.toThrow(
      jobs.ForbiddenError,
    );
    // No state change and no audit rows from the denied attempts.
    const rows = await getDb().select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(rows[0]!.status).toBe("submitted");
    expect(await listAuditLogs(100, getDb())).toHaveLength(0);
  });

  test("a moderator can triage but cannot approve (needs selected_author+)", async () => {
    const { id } = await jobs.submitContribution(recommendation(), { fingerprint: "fp3" }, getDb());
    await jobs.reviewContribution(id, "triage", MOD, undefined, getDb());
    await expect(jobs.reviewContribution(id, "approve", MOD, undefined, getDb())).rejects.toThrow(
      jobs.ForbiddenError,
    );
  });
});

describe("state-machine and kind guards", () => {
  test("applying before approval is an illegal transition (conflict)", async () => {
    const { id } = await jobs.submitContribution(recommendation(), { fingerprint: "fp4" }, getDb());
    await expectRejection(jobs.applyContribution(id, ADMIN, undefined, getDb()));
  });

  test("apply is unsupported for non-source kinds in V1", async () => {
    const sub = parseSubmission({
      kind: "documentation",
      proposedChange: { note: "improve self-host docs" },
    });
    const { id } = await jobs.submitContribution(sub, { fingerprint: "fp5" }, getDb());
    await jobs.reviewContribution(id, "approve", ADMIN, undefined, getDb());
    await expectRejection(jobs.applyContribution(id, ADMIN, undefined, getDb()), jobs.ConflictError);
  });

  test("reviewing a missing contribution throws NotFound", async () => {
    await expectRejection(
      jobs.reviewContribution("con_missing", "triage", MOD, undefined, getDb()),
      jobs.NotFoundError,
    );
  });
});

describe("admin read queries", () => {
  test("listContributions returns rows newest-first", async () => {
    await jobs.submitContribution(recommendation(), { fingerprint: "a" }, getDb());
    await jobs.submitContribution(recommendation(), { fingerprint: "b" }, getDb());
    const rows = await listContributions(50, getDb());
    expect(rows.length).toBe(2);
    expect(rows[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(rows[1]!.createdAt.getTime());
  });
});
