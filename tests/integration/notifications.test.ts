// Integration test for the SP3.3 notifications query layer against real Postgres.
// Exercises: create/list/countUnread/markRead, newest-first + limit, per-user scoping,
// comment_like per-(recipient,comment,actor) dedup, and that comment_reply is NOT deduped.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let notifications: typeof import("@/db/queries/notifications");

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
});

describe("notifications query layer", () => {
  test("createNotification inserts; listNotifications + countUnread reflect it", async () => {
    const created = await notifications.createNotification({
      userId: "usr_alice",
      kind: "comment_reply",
      actorId: "usr_bob",
      title: "Bob replied to your comment",
      body: "Nice point!",
      targetType: "event",
      targetId: "evt_1",
      eventId: "evt_1",
    });
    expect(created).not.toBeNull();
    expect(created!.readAt).toBeNull();

    const list = await notifications.listNotifications("usr_alice");
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Bob replied to your comment");
    expect(list[0]!.eventId).toBe("evt_1");

    expect(await notifications.countUnread("usr_alice")).toBe(1);
  });

  test("countUnread + listNotifications are scoped per recipient", async () => {
    await notifications.createNotification({ userId: "usr_alice", kind: "comment_like", title: "a", actorId: "x", targetId: "cmt_1" });
    await notifications.createNotification({ userId: "usr_carol", kind: "comment_like", title: "c", actorId: "y", targetId: "cmt_2" });

    expect(await notifications.countUnread("usr_alice")).toBe(1);
    expect(await notifications.countUnread("usr_carol")).toBe(1);
    expect(await notifications.countUnread("usr_nobody")).toBe(0);
    expect(await notifications.listNotifications("usr_nobody")).toHaveLength(0);
  });

  test("listNotifications is newest-first and honours the limit", async () => {
    for (let i = 0; i < 3; i++) {
      await notifications.createNotification({
        userId: "usr_alice",
        kind: "comment_reply",
        actorId: "usr_bob",
        title: `reply ${i}`,
        targetId: `evt_${i}`,
        eventId: `evt_${i}`,
      });
    }
    const limited = await notifications.listNotifications("usr_alice", { limit: 2 });
    expect(limited).toHaveLength(2);
    // Newest insert (reply 2) comes first.
    expect(limited[0]!.title).toBe("reply 2");
  });

  test("listUnreadPreview returns only unread notifications newest-first", async () => {
    const oldUnread = await notifications.createNotification({
      userId: "usr_alice",
      kind: "comment_reply",
      actorId: "usr_bob",
      title: "old unread",
      targetId: "evt_old",
      eventId: "evt_old",
    });
    const read = await notifications.createNotification({
      userId: "usr_alice",
      kind: "comment_reply",
      actorId: "usr_bob",
      title: "read notification",
      targetId: "evt_read",
      eventId: "evt_read",
    });
    await notifications.markRead("usr_alice", { ids: [oldUnread!.id, read!.id] });
    await notifications.createNotification({
      userId: "usr_alice",
      kind: "comment_reply",
      actorId: "usr_bob",
      title: "new unread",
      targetId: "evt_new",
      eventId: "evt_new",
    });
    await notifications.createNotification({
      userId: "usr_carol",
      kind: "comment_reply",
      actorId: "usr_bob",
      title: "carol unread",
      targetId: "evt_carol",
      eventId: "evt_carol",
    });

    const preview = await notifications.listUnreadPreview("usr_alice", { limit: 3 });
    expect(preview.map((n) => n.title)).toEqual(["new unread"]);
  });

  test("comment_like dedupes per (recipient, comment, actor)", async () => {
    const first = await notifications.createNotification({
      userId: "usr_alice",
      kind: "comment_like",
      actorId: "usr_bob",
      title: "Bob liked your comment",
      targetType: "comment",
      targetId: "cmt_42",
    });
    const second = await notifications.createNotification({
      userId: "usr_alice",
      kind: "comment_like",
      actorId: "usr_bob",
      title: "Bob liked your comment",
      targetType: "comment",
      targetId: "cmt_42",
    });
    expect(first).not.toBeNull();
    expect(second!.id).toBe(first!.id); // same row, no duplicate
    expect(await notifications.countUnread("usr_alice")).toBe(1);
  });

  test("comment_like from a different actor on the same comment is NOT deduped", async () => {
    await notifications.createNotification({ userId: "usr_alice", kind: "comment_like", actorId: "usr_bob", title: "Bob liked", targetType: "comment", targetId: "cmt_42" });
    await notifications.createNotification({ userId: "usr_alice", kind: "comment_like", actorId: "usr_carol", title: "Carol liked", targetType: "comment", targetId: "cmt_42" });
    expect(await notifications.countUnread("usr_alice")).toBe(2);
  });

  test("comment_reply is never deduped (each reply is a distinct event)", async () => {
    await notifications.createNotification({ userId: "usr_alice", kind: "comment_reply", actorId: "usr_bob", title: "r1", targetType: "event", targetId: "evt_1", eventId: "evt_1" });
    await notifications.createNotification({ userId: "usr_alice", kind: "comment_reply", actorId: "usr_bob", title: "r2", targetType: "event", targetId: "evt_1", eventId: "evt_1" });
    expect(await notifications.countUnread("usr_alice")).toBe(2);
  });

  test("markRead(all) clears unread; markRead(ids) is targeted; both idempotent", async () => {
    const a = await notifications.createNotification({ userId: "usr_alice", kind: "comment_reply", actorId: "usr_bob", title: "r1", targetId: "evt_1", eventId: "evt_1" });
    const b = await notifications.createNotification({ userId: "usr_alice", kind: "comment_reply", actorId: "usr_bob", title: "r2", targetId: "evt_2", eventId: "evt_2" });

    // Targeted: mark only a.
    const marked = await notifications.markRead("usr_alice", { ids: [a!.id] });
    expect(marked).toBe(1);
    expect(await notifications.countUnread("usr_alice")).toBe(1);

    // Idempotent: re-marking a does nothing.
    expect(await notifications.markRead("usr_alice", { ids: [a!.id] })).toBe(0);

    // Mark-all clears the rest (b).
    expect(await notifications.markRead("usr_alice")).toBe(1);
    expect(await notifications.countUnread("usr_alice")).toBe(0);

    // A read row stays read.
    const list = await notifications.listNotifications("usr_alice");
    expect(list.every((n) => n.readAt !== null)).toBe(true);
    void b;
  });

  test("markRead cannot mark another user's notifications", async () => {
    const a = await notifications.createNotification({ userId: "usr_alice", kind: "comment_reply", actorId: "x", title: "r", targetId: "evt_1" });
    const marked = await notifications.markRead("usr_carol", { ids: [a!.id] });
    expect(marked).toBe(0);
    expect(await notifications.countUnread("usr_alice")).toBe(1);
  });
});
