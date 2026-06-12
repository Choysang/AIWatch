// Integration test for the source pause-suggestion job against real Postgres (decision H).
// Inserts sources with controlled age/contribution and events with controlled selection,
// runs suggestSourceReviews, and asserts the flag is set, cleared, surfaced via
// listSourceHealth, and stable across runs. The job must never pause a source itself.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let suggestSourceReviews: typeof import("@/db/jobs/suggest-source-review").suggestSourceReviews;
let listSourceHealth: typeof import("@/db/queries/sources").listSourceHealth;

const NOW = new Date("2026-05-26T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

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
  ({ suggestSourceReviews } = await import("@/db/jobs/suggest-source-review"));
  ({ listSourceHealth } = await import("@/db/queries/sources"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.eventScores);
  await getDb().delete(schema.eventJudgments);
  await getDb().delete(schema.eventPosts);
  await getDb().delete(schema.events);
  await getDb().delete(schema.sources);
});

async function insertSource(opts: {
  id: string;
  createdAt: Date;
  lastFetchAt?: Date | null;
  reviewReason?: string | null;
  reviewSuggestedAt?: Date | null;
}): Promise<void> {
  await getDb().insert(schema.sources).values({
    id: opts.id,
    name: opts.id,
    platform: "blog",
    level: "L1",
    sourceType: "official",
    connectorType: "mock",
    createdAt: opts.createdAt,
    lastFetchAt: opts.lastFetchAt ?? null,
    reviewReason: opts.reviewReason ?? null,
    reviewSuggestedAt: opts.reviewSuggestedAt ?? null,
  });
}

async function insertEvent(opts: {
  id: string;
  sourceId: string;
  publishedAt: Date;
  selectedLevel?: "none" | "B" | "A" | "S";
  promotedAt?: Date | null;
}): Promise<void> {
  await getDb().insert(schema.events).values({
    id: opts.id,
    title: opts.id,
    mainSourceId: opts.sourceId,
    publishedAt: opts.publishedAt,
    selectedLevel: opts.selectedLevel ?? "none",
    promotedAt: opts.promotedAt ?? null,
  });
}

async function reviewOf(id: string): Promise<{ reason: string | null; suggestedAt: Date | null }> {
  const rows = await getDb()
    .select({ reason: schema.sources.reviewReason, suggestedAt: schema.sources.reviewSuggestedAt })
    .from(schema.sources)
    .where(eq(schema.sources.id, id));
  return rows[0]!;
}

describe("suggestSourceReviews (real Postgres)", () => {
  test("suggests pause for an old, crawling source with zero selected contribution in 60d", async () => {
    await insertSource({ id: "src_dead", createdAt: ago(70), lastFetchAt: ago(0.1) });
    // A non-selected event so the source clearly ran, but contributed nothing selected.
    await insertEvent({ id: "e_dead", sourceId: "src_dead", publishedAt: ago(40) });

    const result = await suggestSourceReviews(NOW, getDb());

    expect(result.flagged).toBe(1);
    expect((await reviewOf("src_dead")).reason).toBe("no_contribution_60d");
  });

  test("marks for review when the 30d selected rate is low on a big-enough sample", async () => {
    await insertSource({ id: "src_low", createdAt: ago(70), lastFetchAt: ago(0.1) });
    // One selected event 45d ago keeps 60d-contribution > 0 (so it's the low-rate path,
    // not no-contribution), but recent 30d output is high-volume and unselected.
    await insertEvent({ id: "e_old_sel", sourceId: "src_low", publishedAt: ago(45), selectedLevel: "B", promotedAt: ago(45) });
    for (let i = 0; i < 12; i++) {
      await insertEvent({ id: `e_low_${i}`, sourceId: "src_low", publishedAt: ago(5) });
    }

    await suggestSourceReviews(NOW, getDb());

    expect((await reviewOf("src_low")).reason).toBe("low_selected_rate_30d");
  });

  test("does not flag a healthy contributing source", async () => {
    await insertSource({ id: "src_ok", createdAt: ago(70), lastFetchAt: ago(0.1) });
    await insertEvent({ id: "e_ok_sel", sourceId: "src_ok", publishedAt: ago(3), selectedLevel: "A", promotedAt: ago(3) });
    for (let i = 0; i < 10; i++) {
      await insertEvent({ id: `e_ok_${i}`, sourceId: "src_ok", publishedAt: ago(4), selectedLevel: i < 5 ? "B" : "none", promotedAt: i < 5 ? ago(4) : null });
    }

    const result = await suggestSourceReviews(NOW, getDb());

    expect(result.flagged).toBe(0);
    expect((await reviewOf("src_ok")).reason).toBeNull();
  });

  test("clears a stale suggestion when the source recovers", async () => {
    await insertSource({
      id: "src_recovered",
      createdAt: ago(70),
      lastFetchAt: ago(0.1),
      reviewReason: "no_contribution_60d",
      reviewSuggestedAt: ago(10),
    });
    // Now it has a fresh selected contribution within 60d.
    await insertEvent({ id: "e_rec", sourceId: "src_recovered", publishedAt: ago(2), selectedLevel: "B", promotedAt: ago(2) });

    const result = await suggestSourceReviews(NOW, getDb());

    expect(result.cleared).toBe(1);
    const review = await reviewOf("src_recovered");
    expect(review.reason).toBeNull();
    expect(review.suggestedAt).toBeNull();
  });

  test("preserves the original suggestion time across re-runs while still flagged", async () => {
    await insertSource({ id: "src_stable", createdAt: ago(70), lastFetchAt: ago(0.1) });

    await suggestSourceReviews(NOW, getDb());
    const first = await reviewOf("src_stable");
    expect(first.reason).toBe("no_contribution_60d");

    // Second run a minute later: still flagged, suggestion time unchanged, not re-counted.
    const later = new Date(NOW.getTime() + 60_000);
    const result = await suggestSourceReviews(later, getDb());
    const second = await reviewOf("src_stable");

    expect(result.flagged).toBe(0);
    expect(second.reason).toBe("no_contribution_60d");
    expect(second.suggestedAt?.getTime()).toBe(first.suggestedAt?.getTime());
  });

  test("listSourceHealth surfaces the review suggestion to the admin console", async () => {
    await insertSource({ id: "src_health", createdAt: ago(70), lastFetchAt: ago(0.1) });
    await suggestSourceReviews(NOW, getDb());

    const health = await listSourceHealth(getDb());
    const row = health.find((r) => r.id === "src_health")!;
    expect(row.reviewReason).toBe("no_contribution_60d");
    expect(row.reviewSuggestedAt).toBeInstanceOf(Date);
  });
});
