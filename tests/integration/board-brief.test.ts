// Integration test for the per-board brief (v0.5 B2) against real Postgres. Verifies the brief
// reuses the deterministic report engine but scopes events to the board interest (tags ∪ sources),
// so only matching events appear in the assembled sections. Mirrors reports.test.ts seeding.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let buildBoardBrief: typeof import("@/reports/board-brief").buildBoardBrief;

const SRC_A = "src_brief_a";
const SRC_B = "src_brief_b";
const NOW = new Date("2026-05-24T12:00:00Z"); // 20:00 Asia/Shanghai
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
  ({ buildBoardBrief } = await import("@/reports/board-brief"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values([
      { id: SRC_A, name: "Src A", platform: "blog", level: "L1", sourceType: "official", connectorType: "mock" },
      { id: SRC_B, name: "Src B", platform: "blog", level: "L1", sourceType: "official", connectorType: "mock" },
    ])
    .onConflictDoNothing({ target: schema.sources.id });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

function ev(opts: {
  id: string;
  title: string;
  source: string;
  tags?: string[];
  level?: "none" | "B" | "A" | "S";
  qualityScore?: number;
  promotedAt?: Date | null;
  publishedAt: Date;
}) {
  return {
    id: opts.id,
    title: opts.title,
    mainSourceId: opts.source,
    tags: opts.tags ?? [],
    selectedLevel: opts.level ?? "none",
    selectedLabel: opts.level && opts.level !== "none" ? opts.level : null,
    qualityScore: opts.qualityScore,
    promotedAt: opts.promotedAt ?? null,
    publishedAt: opts.publishedAt,
  };
}

beforeEach(async () => {
  await getDb().delete(schema.events);
  // Focus (selected this window): one matches the "agent" tag, one is from SRC_B, one is noise.
  await getDb().insert(schema.events).values([
    ev({ id: "e_agent", title: "Agent S", source: SRC_A, tags: ["agent"], level: "S", qualityScore: 95, promotedAt: ago(0.2), publishedAt: ago(0.3) }),
    ev({ id: "e_srcb", title: "SrcB A", source: SRC_B, tags: ["other"], level: "A", qualityScore: 88, promotedAt: ago(0.3), publishedAt: ago(0.4) }),
    ev({ id: "e_noise", title: "Noise S", source: SRC_A, tags: ["crypto"], level: "S", qualityScore: 99, promotedAt: ago(0.25), publishedAt: ago(0.35) }),
    // Worth-watching (high score, unselected, published this window) carrying the agent tag.
    ev({ id: "e_watch", title: "Agent watch", source: SRC_A, tags: ["agent"], qualityScore: 90, publishedAt: ago(0.5) }),
  ]);
});

const section = (r: { sections: { key: string; items: { id: string }[] }[] }, key: string) =>
  r.sections.find((s) => s.key === key)!;

describe("buildBoardBrief", () => {
  test("a tag interest scopes the brief to matching events only", async () => {
    const brief = await buildBoardBrief({
      interest: { tags: ["agent"], sourceIds: [] },
      kind: "daily",
      now: NOW,
      db: getDb(),
    });
    // Focus: only the agent-tagged selected event (not SrcB, not the crypto noise).
    expect(section(brief, "today_focus").items.map((i) => i.id)).toEqual(["e_agent"]);
    // Worth-watching: the agent-tagged high-score unselected event.
    expect(section(brief, "worth_watching").items.map((i) => i.id)).toEqual(["e_watch"]);
  });

  test("a source interest scopes by main source (tags ∪ sources is a union)", async () => {
    const brief = await buildBoardBrief({
      interest: { tags: ["agent"], sourceIds: [SRC_B] },
      kind: "daily",
      now: NOW,
      db: getDb(),
    });
    // agent-tag OR from SRC_B → e_agent + e_srcb in focus (still not the crypto noise from SRC_A).
    expect(new Set(section(brief, "today_focus").items.map((i) => i.id))).toEqual(
      new Set(["e_agent", "e_srcb"]),
    );
  });

  test("an empty interest yields an empty brief (not the whole feed)", async () => {
    const brief = await buildBoardBrief({
      interest: { tags: [], sourceIds: [] },
      kind: "daily",
      now: NOW,
      db: getDb(),
    });
    for (const s of brief.sections) expect(s.items).toHaveLength(0);
  });
});
