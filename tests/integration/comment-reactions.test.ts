// Integration test for SP3.1 comment likes against real Postgres.
// Exercises: add/remove idempotency, denormalized like_count maintenance, XOR identity,
// per-identity dedupe, CommentNotFoundError, and viewer-state lookup.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let comments: typeof import("@/db/queries/comments");
let cr: typeof import("@/db/queries/comment-reactions");

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
  cr = await import("@/db/queries/comment-reactions");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.commentReactions);
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

async function seedEvent(id: string, sourceId: string): Promise<void> {
  await getDb().insert(schema.events).values({ id, title: id, mainSourceId: sourceId });
}

async function seedComment(eventId: string, fingerprint: string): Promise<string> {
  const row = await comments.addComment({
    eventId,
    body: "A substantive comment worth liking, with real content here.",
    identity: { userId: null, fingerprint },
  });
  return row.id;
}

describe("comment reactions (real Postgres)", () => {
  test("addCommentReaction increments like_count and is idempotent per identity", async () => {
    const sourceId = await seedSource();
    await seedEvent("evt_cr1", sourceId);
    const commentId = await seedComment("evt_cr1", "fp_author");

    const r1 = await cr.addCommentReaction({
      commentId,
      identity: { userId: null, fingerprint: "fp_liker" },
    });
    expect(r1.likeCount).toBe(1);

    // Same identity again → no-op, count unchanged.
    const r2 = await cr.addCommentReaction({
      commentId,
      identity: { userId: null, fingerprint: "fp_liker" },
    });
    expect(r2.likeCount).toBe(1);

    const rows = await getDb()
      .select()
      .from(schema.commentReactions)
      .where(eq(schema.commentReactions.commentId, commentId));
    expect(rows.length).toBe(1);
  });

  test("two distinct identities → like_count 2", async () => {
    const sourceId = await seedSource();
    await seedEvent("evt_cr2", sourceId);
    const commentId = await seedComment("evt_cr2", "fp_author");

    await cr.addCommentReaction({ commentId, identity: { userId: null, fingerprint: "fp_a" } });
    const r = await cr.addCommentReaction({
      commentId,
      identity: { userId: null, fingerprint: "fp_b" },
    });
    expect(r.likeCount).toBe(2);
  });

  test("removeCommentReaction decrements and is idempotent; never goes negative", async () => {
    const sourceId = await seedSource();
    await seedEvent("evt_cr3", sourceId);
    const commentId = await seedComment("evt_cr3", "fp_author");

    await cr.addCommentReaction({ commentId, identity: { userId: null, fingerprint: "fp_x" } });
    const r1 = await cr.removeCommentReaction({
      commentId,
      identity: { userId: null, fingerprint: "fp_x" },
    });
    expect(r1.likeCount).toBe(0);

    // Removing again → still 0, no underflow.
    const r2 = await cr.removeCommentReaction({
      commentId,
      identity: { userId: null, fingerprint: "fp_x" },
    });
    expect(r2.likeCount).toBe(0);
  });

  test("identity-XOR enforced", async () => {
    const sourceId = await seedSource();
    await seedEvent("evt_cr4", sourceId);
    const commentId = await seedComment("evt_cr4", "fp_author");

    await expectRejection(
      cr.addCommentReaction({ commentId, identity: { userId: null, fingerprint: null } }),
      cr.CommentReactionIdentityError,
    );
    await expectRejection(
      cr.addCommentReaction({ commentId, identity: { userId: "u", fingerprint: "f" } }),
      cr.CommentReactionIdentityError,
    );
  });

  test("CommentNotFoundError on unknown comment", async () => {
    await expectRejection(
      cr.addCommentReaction({
        commentId: "cmt_missing",
        identity: { userId: null, fingerprint: "fp_q" },
      }),
      cr.CommentNotFoundError,
    );
  });

  test("getViewerCommentReactions maps liked comments for the viewer", async () => {
    const sourceId = await seedSource();
    await seedEvent("evt_cr5", sourceId);
    const c1 = await seedComment("evt_cr5", "fp_author1");
    await getDb().insert(schema.eventComments).values({
      id: "cmt_other",
      eventId: "evt_cr5",
      fingerprint: "fp_author2",
      body: "another comment with enough substance to be valid here",
      bodyHash: "hash_other_1234567890abcdef",
    });

    await cr.addCommentReaction({ commentId: c1, identity: { userId: null, fingerprint: "fp_viewer" } });

    const map = await cr.getViewerCommentReactions(
      [c1, "cmt_other"],
      { userId: null, fingerprint: "fp_viewer" },
    );
    expect(map.get(c1)).toBe(true);
    expect(map.get("cmt_other") ?? false).toBe(false);

    // Empty input / null identity short-circuits.
    expect((await cr.getViewerCommentReactions([], { userId: null, fingerprint: "fp_viewer" })).size).toBe(0);
    expect((await cr.getViewerCommentReactions([c1], { userId: null, fingerprint: null })).size).toBe(0);
  });
});
