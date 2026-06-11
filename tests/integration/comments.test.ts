// Integration test for the Slice 9 event-comments path against real Postgres.
// Exercises: add/list semantics, bodyHash dedupe per identity, expert vs non-expert
// flagging, deterministic low-value filtering, identity-XOR enforcement, and the
// EventNotFoundError surface.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let comments: typeof import("@/db/queries/comments");
let notifications: typeof import("@/db/queries/notifications");

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
  savedDatabaseUrl = process.env.DATABASE_URL;
  pgHandle = await startEmbeddedPostgres();
  process.env.DATABASE_URL = pgHandle.connectionString;
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  comments = await import("@/db/queries/comments");
  notifications = await import("@/db/queries/notifications");

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
  test("addComment stores a valid comment and listEventComments returns it in items", async () => {
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
    expect(sections.items.length).toBe(1);
    expect(sections.items[0]!.id).toBe(row.id);
    expect(sections.items[0]!.isExpert).toBe(false);
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

  test("expert role tags comment with isExpert=true; expert and regular both surface in items", async () => {
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
    expect(sections.items.length).toBe(2); // expert + regular both surface
    const expert = sections.items.find((c) => c.isExpert);
    const regular = sections.items.find((c) => !c.isExpert);
    expect(expert?.isExpert).toBe(true);
    expect(regular?.isExpert).toBe(false);
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

  test("getTopCommentsForEvents limits recent valid top-level comments per event", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_top_a", sourceId, title: "A" });
    await seedEvent({ id: "evt_top_b", sourceId, title: "B" });
    const base = new Date("2026-05-01T00:00:00Z").getTime();
    const rows: (typeof schema.eventComments.$inferInsert)[] = [];

    for (let i = 0; i < 5; i++) {
      rows.push({
        id: `cmt_top_a_${i}`,
        eventId: "evt_top_a",
        fingerprint: `fp_top_a_${i}`,
        body: `a${i}`,
        bodyHash: `hash_top_a_${i}`,
        classification: "valid",
        createdAt: new Date(base + i * 1000),
      });
      rows.push({
        id: `cmt_top_b_${i}`,
        eventId: "evt_top_b",
        fingerprint: `fp_top_b_${i}`,
        body: `b${i}`,
        bodyHash: `hash_top_b_${i}`,
        classification: "valid",
        createdAt: new Date(base + i * 1000),
      });
    }

    await getDb().insert(schema.eventComments).values(rows);

    const top = await comments.getTopCommentsForEvents(["evt_top_a", "evt_top_b"], 3);
    expect(top.get("evt_top_a")).toEqual(["a4", "a3", "a2"]);
    expect(top.get("evt_top_b")).toEqual(["b4", "b3", "b2"]);
  });
});

describe("comment replies (SP3.1)", () => {
  test("a reply nests under its top-level parent and is not a separate section entry", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_r1", sourceId, title: "T" });

    const parent = await comments.addComment({
      eventId: "evt_r1",
      body: "Top-level: the benchmark methodology seems sound to me.",
      identity: { userId: null, fingerprint: "fp_parent" },
    });
    const reply = await comments.addComment({
      eventId: "evt_r1",
      body: "Reply: actually appendix C contradicts that claim.",
      identity: { userId: null, fingerprint: "fp_child" },
      parentId: parent.id,
    });
    expect(reply.parentId).toBe(parent.id);

    const sections = await comments.listEventComments("evt_r1");
    // Only the parent surfaces as a top-level entry.
    expect(sections.latest.length).toBe(1);
    expect(sections.latest[0]!.id).toBe(parent.id);
    // The reply is nested under it.
    expect(sections.latest[0]!.replies.length).toBe(1);
    expect(sections.latest[0]!.replies[0]!.id).toBe(reply.id);
  });

  test("reply to a comment in a different event is rejected", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_r2a", sourceId, title: "A" });
    await seedEvent({ id: "evt_r2b", sourceId, title: "B" });
    const parent = await comments.addComment({
      eventId: "evt_r2a",
      body: "Parent over in event A with substantive content.",
      identity: { userId: null, fingerprint: "fp_p" },
    });
    await expectRejection(
      comments.addComment({
        eventId: "evt_r2b",
        body: "Cross-event reply should not be allowed here.",
        identity: { userId: null, fingerprint: "fp_c" },
        parentId: parent.id,
      }),
      comments.InvalidParentError,
    );
  });

  test("reply to a reply is rejected (single-level threads only)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_r3", sourceId, title: "T" });
    const parent = await comments.addComment({
      eventId: "evt_r3",
      body: "Top-level comment with enough substance to be valid.",
      identity: { userId: null, fingerprint: "fp_p" },
    });
    const reply = await comments.addComment({
      eventId: "evt_r3",
      body: "First-level reply with substantive content here.",
      identity: { userId: null, fingerprint: "fp_c" },
      parentId: parent.id,
    });
    await expectRejection(
      comments.addComment({
        eventId: "evt_r3",
        body: "Reply to the reply — should be rejected as too deep.",
        identity: { userId: null, fingerprint: "fp_d" },
        parentId: reply.id,
      }),
      comments.InvalidParentError,
    );
  });

  test("reply to a missing comment is rejected", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_r4", sourceId, title: "T" });
    await expectRejection(
      comments.addComment({
        eventId: "evt_r4",
        body: "Reply to a parent that does not exist anywhere.",
        identity: { userId: null, fingerprint: "fp_c" },
        parentId: "cmt_nope",
      }),
      comments.InvalidParentError,
    );
  });

  test("low-value reply is stored but hidden from the nested list", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_r5", sourceId, title: "Some descriptive event title" });
    const parent = await comments.addComment({
      eventId: "evt_r5",
      body: "Top-level comment that is clearly substantive and valid.",
      identity: { userId: null, fingerprint: "fp_p" },
    });
    const lv = await comments.addComment({
      eventId: "evt_r5",
      body: "👍",
      identity: { userId: null, fingerprint: "fp_c" },
      parentId: parent.id,
    });
    expect(lv.classification).toBe("low_value");

    const sections = await comments.listEventComments("evt_r5");
    expect(sections.latest[0]!.replies.length).toBe(0);
  });

  test("hot sort orders by like_count desc (popularity beats recency)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_r6", sourceId, title: "T" });
    // `popular` is posted FIRST (older); `recent` second (newer). Sorting by likes must
    // float `popular` to the top despite it being the older comment.
    const popular = await comments.addComment({
      eventId: "evt_r6",
      body: "Posted earlier but ends up far more popular by like count.",
      identity: { userId: null, fingerprint: "fp_popular" },
    });
    const recent = await comments.addComment({
      eventId: "evt_r6",
      body: "Posted later, newer, but with fewer likes overall here.",
      identity: { userId: null, fingerprint: "fp_recent" },
    });
    // Give `popular` more likes via the denormalized counter.
    await getDb()
      .update(schema.eventComments)
      .set({ likeCount: 5 })
      .where(eq(schema.eventComments.id, popular.id));

    // hot: popularity wins over recency.
    const hot = await comments.listEventComments("evt_r6", { sort: "hot" });
    expect(hot.items.length).toBe(2);
    expect(hot.items[0]!.id).toBe(popular.id); // more-liked first
    expect(hot.items[1]!.id).toBe(recent.id);

    // latest: recency wins — proves the two sorts genuinely differ.
    const latest = await comments.listEventComments("evt_r6", { sort: "latest" });
    expect(latest.items[0]!.id).toBe(recent.id);
  });

  test("replying to a logged-in user's comment notifies the author (not self)", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_rn", sourceId, title: "Some descriptive event title" });
    const author = await seedUser("usr_parent");
    const parent = await comments.addComment({
      eventId: "evt_rn",
      body: "Top-level comment by a logged-in author, substantive content.",
      identity: { userId: author, fingerprint: null },
    });

    // Anonymous reader replies → author gets one comment_reply notification.
    await comments.addComment({
      eventId: "evt_rn",
      body: "A thoughtful reply from an anonymous reader, real substance.",
      identity: { userId: null, fingerprint: "fp_replier" },
      parentId: parent.id,
    });
    const list = await notifications.listNotifications("usr_parent");
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("comment_reply");
    expect(list[0]!.eventId).toBe("evt_rn");

    // The author replying to their own comment notifies no one.
    await comments.addComment({
      eventId: "evt_rn",
      body: "Author follows up on their own comment, still substantive.",
      identity: { userId: author, fingerprint: null },
      parentId: parent.id,
    });
    expect(await notifications.countUnread("usr_parent")).toBe(1);
  });

  test("replying to an anonymous-authored comment notifies no one", async () => {
    const sourceId = await seedSource();
    await seedEvent({ id: "evt_rn2", sourceId, title: "Another descriptive title here" });
    const parent = await comments.addComment({
      eventId: "evt_rn2",
      body: "Top-level comment by an anonymous reader, substantive content.",
      identity: { userId: null, fingerprint: "fp_anon_parent" },
    });
    await comments.addComment({
      eventId: "evt_rn2",
      body: "A reply that has nowhere to be delivered, but real substance.",
      identity: { userId: null, fingerprint: "fp_replier" },
      parentId: parent.id,
    });
    const all = await getDb().select().from(schema.notifications);
    expect(all.length).toBe(0);
  });
});
