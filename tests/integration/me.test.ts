import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let me: typeof import("@/db/queries/me");

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
  me = await import("@/db/queries/me");

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.eventComments);
  await getDb().delete(schema.eventReactions);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.posts);
  await getDb().delete(schema.sources);
});

async function seedEvent(id: string, title: string, publishedAt: Date): Promise<void> {
  await getDb().insert(schema.sources).values({
    id: `src_${id}`,
    name: `Source ${id}`,
    platform: "blog",
    level: "L2",
    sourceType: "official",
    connectorType: "mock",
  });
  await getDb().insert(schema.posts).values({
    id: `post_${id}`,
    sourceId: `src_${id}`,
    platform: "blog",
    url: `https://example.com/${id}`,
    publishedAt,
  });
  await getDb().insert(schema.events).values({
    id,
    title,
    summary: `${title} summary`,
    tags: ["测试"],
    mainSourceId: `src_${id}`,
    mainPostId: `post_${id}`,
    publishedAt,
  });
}

describe("my interactions queries (real Postgres)", () => {
  test("lists the current user's reacted events by reaction kind, newest reaction first", async () => {
    await seedEvent("evt_old_like", "Old liked event", new Date("2026-06-01T00:00:00Z"));
    await seedEvent("evt_new_like", "New liked event", new Date("2026-06-02T00:00:00Z"));
    await seedEvent("evt_star", "Starred event", new Date("2026-06-03T00:00:00Z"));
    await seedEvent("evt_other", "Other user event", new Date("2026-06-04T00:00:00Z"));

    await getDb().insert(schema.eventReactions).values([
      {
        id: "rx_old_like",
        eventId: "evt_old_like",
        kind: "like",
        userId: "usr_me",
        createdAt: new Date("2026-06-05T00:00:00Z"),
      },
      {
        id: "rx_new_like",
        eventId: "evt_new_like",
        kind: "like",
        userId: "usr_me",
        createdAt: new Date("2026-06-06T00:00:00Z"),
      },
      {
        id: "rx_star",
        eventId: "evt_star",
        kind: "star",
        userId: "usr_me",
        createdAt: new Date("2026-06-07T00:00:00Z"),
      },
      {
        id: "rx_other",
        eventId: "evt_other",
        kind: "like",
        userId: "usr_other",
        createdAt: new Date("2026-06-08T00:00:00Z"),
      },
    ]);

    const likes = await me.listMyReactionEvents("usr_me", "like");
    const stars = await me.listMyReactionEvents("usr_me", "star");

    expect(likes.map((event) => event.id)).toEqual(["evt_new_like", "evt_old_like"]);
    expect(likes[0]!.sourceName).toBe("Source evt_new_like");
    expect(likes[0]!.url).toBe("https://example.com/evt_new_like");
    expect(stars.map((event) => event.id)).toEqual(["evt_star"]);
  });

  test("lists the current user's comments with their related event", async () => {
    await seedEvent("evt_comment_a", "Commented event A", new Date("2026-06-01T00:00:00Z"));
    await seedEvent("evt_comment_b", "Commented event B", new Date("2026-06-02T00:00:00Z"));

    await getDb().insert(schema.eventComments).values([
      {
        id: "cmt_old",
        eventId: "evt_comment_a",
        userId: "usr_me",
        body: "The practical detail here is useful.",
        bodyHash: "hash_old",
        createdAt: new Date("2026-06-05T00:00:00Z"),
      },
      {
        id: "cmt_new",
        eventId: "evt_comment_b",
        userId: "usr_me",
        body: "This changes how I evaluate the product.",
        bodyHash: "hash_new",
        createdAt: new Date("2026-06-06T00:00:00Z"),
      },
      {
        id: "cmt_other",
        eventId: "evt_comment_b",
        userId: "usr_other",
        body: "Someone else's comment.",
        bodyHash: "hash_other",
        createdAt: new Date("2026-06-07T00:00:00Z"),
      },
    ]);

    const comments = await me.listMyComments("usr_me");

    expect(comments.map((comment) => comment.id)).toEqual(["cmt_new", "cmt_old"]);
    expect(comments[0]!.eventId).toBe("evt_comment_b");
    expect(comments[0]!.eventTitle).toBe("Commented event B");
    expect(comments[0]!.sourceName).toBe("Source evt_comment_b");
  });
});
