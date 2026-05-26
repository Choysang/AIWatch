// Integration test for the Slice 9 event-comments path against real Postgres.
// Exercises: add/list semantics, bodyHash dedupe per identity, expert vs non-expert
// sectioning, deterministic low-value filtering, identity-XOR enforcement, and the
// EventNotFoundError surface.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let comments: typeof import("@/db/queries/comments");

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

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

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    pgHandle = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pgHandle.connectionString;
  }
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  comments = await import("@/db/queries/comments");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.eventComments);
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.posts);
  await getDb().delete(schema.sources);
  await getDb().delete(schema.user);
});

async function seedSource(id = "src_test"): Promise<string> {
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

async function seedEvent(opts: { id: string; sourceId: string; title: string }): Promise<void> {
  await getDb().insert(schema.events).values({
    id: opts.id,
    title: opts.title,
    mainSourceId: opts.sourceId,
  });
}

async function seedUser(id: string, role: "user" | "expert" = "user"): Promise<string> {
  await getDb().insert(schema.user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    role,
  });
  return id;
}

describe("event comments (real Postgres)", () => {
  test("addComment stores a valid comment and listEventComments returns it under latest+highQuality", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c1", sourceId, title: "GPT-5 released" });
    const userId = await seedUser("usr_alice");

    const row = await comments.addComment({
      eventId: "evt_c1",
      body: "The benchmark numbers look strong, especially on MATH-500.",
      identity: { userId, fingerprint: null },
    });
    expect(row.classification).toBe("valid");
    expect(row.isExpert).toBe(false);

    const sections = await comments.listEventComments("evt_c1");
    expect(sections.latest.length).toBe(1);
    expect(sections.highQuality.length).toBe(1);
    expect(sections.expertViews.length).toBe(0);
    expect(sections.latest[0]!.id).toBe(row.id);
  });

  test("addComment dedupes per (event, identity, bodyHash)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c2", sourceId, title: "T" });
    const userId = await seedUser("usr_bob");

    const first = await comments.addComment({
      eventId: "evt_c2",
      body: "Real substantive feedback about the release timeline.",
      identity: { userId, fingerprint: null },
    });
    const second = await comments.addComment({
      eventId: "evt_c2",
      body: "Real substantive feedback about the release timeline.",
      identity: { userId, fingerprint: null },
    });
    expect(second.id).toBe(first.id); // same row returned

    const all = await getDb().select().from(schema.eventComments).where(eq(schema.eventComments.eventId, "evt_c2"));
    expect(all.length).toBe(1);
  });

  test("low-value comments are stored but excluded from listings", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c3", sourceId, title: "Some big event title here" });
    const userId = await seedUser("usr_carol");

    const lv = await comments.addComment({
      eventId: "evt_c3",
      body: "👍",
      identity: { userId, fingerprint: null },
    });
    expect(lv.classification).toBe("low_value");

    const sections = await comments.listEventComments("evt_c3");
    expect(sections.latest.length).toBe(0);
    expect(sections.highQuality.length).toBe(0);
    expect(sections.expertViews.length).toBe(0);

    // But it IS in the table — admins can audit.
    const all = await getDb()
      .select()
      .from(schema.eventComments)
      .where(eq(schema.eventComments.eventId, "evt_c3"));
    expect(all.length).toBe(1);
  });

  test("expert role tags comment with isExpert=true and routes to expertViews", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c4", sourceId, title: "T" });
    const expertId = await seedUser("usr_expert", "expert");
    const regularId = await seedUser("usr_regular", "user");

    await comments.addComment({
      eventId: "evt_c4",
      body: "From an expert: the eval methodology in appendix B is suspect.",
      identity: { userId: expertId, fingerprint: null },
    });
    await comments.addComment({
      eventId: "evt_c4",
      body: "From a regular user: I tried it on my use case, latency is fine.",
      identity: { userId: regularId, fingerprint: null },
    });

    const sections = await comments.listEventComments("evt_c4");
    expect(sections.expertViews.length).toBe(1);
    expect(sections.expertViews[0]!.isExpert).toBe(true);
    expect(sections.highQuality.length).toBe(1);
    expect(sections.highQuality[0]!.isExpert).toBe(false);
    expect(sections.latest.length).toBe(2); // expert + regular both surface in latest
  });

  test("title-repost comment is classified low-value and hidden", async () => {
    const sourceId = await seedSource();
    const title = "OpenAI releases GPT-5 with 50% lower hallucination rate";
    await seedEvent({ id: "evt_c5", sourceId, title });

    const row = await comments.addComment({
      eventId: "evt_c5",
      body: title,
      identity: { userId: null, fingerprint: "fp_titlerep" },
    });
    expect(row.classification).toBe("low_value");
    expect(row.category).toBe("low_value");

    const sections = await comments.listEventComments("evt_c5");
    expect(sections.latest.length).toBe(0);
  });

  test("identity-XOR enforced: both null or both set rejected", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c6", sourceId, title: "T" });

    await expectRejection(
      comments.addComment({
        eventId: "evt_c6",
        body: "valid substantive content here, no problem",
        identity: { userId: null, fingerprint: null },
      }),
      comments.CommentIdentityError,
    );
    await expectRejection(
      comments.addComment({
        eventId: "evt_c6",
        body: "valid substantive content here, no problem",
        identity: { userId: "u", fingerprint: "f" },
      }),
      comments.CommentIdentityError,
    );
  });

  test("EventNotFoundError on unknown event", async () => {
    await expectRejection(
      comments.addComment({
        eventId: "evt_missing",
        body: "valid substantive content here, no problem",
        identity: { userId: null, fingerprint: "fp_a" },
      }),
      comments.EventNotFoundError,
    );
  });

  test("EmptyBodyError on whitespace-only body", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c7", sourceId, title: "T" });

    await expectRejection(
      comments.addComment({
        eventId: "evt_c7",
        body: "   \n\t  ",
        identity: { userId: null, fingerprint: "fp_b" },
      }),
      comments.EmptyBodyError,
    );
  });

  test("different identities post identical bodies → two rows (no cross-identity dedupe)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_c8", sourceId, title: "T" });

    const body = "We saw identical regression on our internal eval set.";
    await comments.addComment({
      eventId: "evt_c8",
      body,
      identity: { userId: null, fingerprint: "fp_x" },
    });
    await comments.addComment({
      eventId: "evt_c8",
      body,
      identity: { userId: null, fingerprint: "fp_y" },
    });
    const sections = await comments.listEventComments("evt_c8");
    expect(sections.latest.length).toBe(2);
  });
});
