// Integration test for report generation + public read path against real Postgres
// (decision H). Covers deterministic section assembly through the DB, calendar-keyed
// upsert, the daily public queries/routes, and that weekly reports publish under their own kind.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let savedDatabaseUrl: string | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let generateReport: typeof import("@/db/jobs/generate-report").generateReport;
let getLatestDaily: typeof import("@/db/queries/public-reports").getLatestDaily;
let getDailyByDate: typeof import("@/db/queries/public-reports").getDailyByDate;
let listDailies: typeof import("@/db/queries/public-reports").listDailies;
let appCalendarDate: typeof import("@/core/time").appCalendarDate;

const SOURCE_ID = "src_rpt";
const POST_ID = "post_rpt";
const NOW = new Date("2026-05-24T12:00:00Z"); // 20:00 Asia/Shanghai -> calendar 2026-05-24
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
  ({ generateReport } = await import("@/db/jobs/generate-report"));
  ({ getLatestDaily, getDailyByDate, listDailies } = await import("@/db/queries/public-reports"));
  ({ appCalendarDate } = await import("@/core/time"));

  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
  await getDb()
    .insert(schema.sources)
    .values({
      id: SOURCE_ID,
      name: "OpenAI Blog",
      platform: "blog",
      level: "L1",
      sourceType: "official",
      connectorType: "mock",
    })
    .onConflictDoNothing({ target: schema.sources.id });
  await getDb()
    .insert(schema.posts)
    .values({ id: POST_ID, sourceId: SOURCE_ID, platform: "blog", url: "https://openai.com/x" })
    .onConflictDoNothing({ target: schema.posts.id });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.reports);
  await getDb().delete(schema.events);
});

async function insertEvent(opts: {
  id: string;
  title: string;
  category?: string;
  level?: "none" | "B" | "A" | "S";
  qualityScore?: number;
  tags?: string[];
  promotedAt?: Date | null;
  publishedAt: Date;
  mainPostId?: string | null;
}): Promise<void> {
  const {
    id,
    title,
    category,
    tags = [],
    level = "none",
    qualityScore,
    promotedAt = null,
    publishedAt,
    mainPostId = null,
  } = opts;
  await getDb().insert(schema.events).values({
    id,
    title,
    category,
    selectedLevel: level,
    selectedLabel: level === "none" ? null : level,
    promotedAt,
    publishedAt,
    qualityScore,
    tags,
    mainSourceId: SOURCE_ID,
    mainPostId,
  });
}

// A representative day's events: focus (selected in window), watching (high-score
// unselected in window), followup (selected in the prior window), and excluded items.
async function seedDay(): Promise<void> {
  await insertEvent({ id: "s1", title: "S focus", tags: ["Claude", "企业智能体"], level: "S", qualityScore: 95, promotedAt: ago(0.2), publishedAt: ago(0.3), mainPostId: POST_ID });
  await insertEvent({ id: "b1", title: "B focus", tags: ["双语 ASR"], level: "B", qualityScore: 80, promotedAt: ago(0.5), publishedAt: ago(0.6) });
  await insertEvent({ id: "w_hi", title: "watch hi", tags: ["RAG"], qualityScore: 90, publishedAt: ago(0.5) });
  await insertEvent({ id: "w_lo", title: "watch lo", qualityScore: 50, publishedAt: ago(0.5) }); // below min
  await insertEvent({ id: "a_prev", title: "A followup", level: "A", qualityScore: 88, promotedAt: ago(1.5), publishedAt: ago(1.6) });
  await insertEvent({ id: "ancient", title: "old", level: "S", qualityScore: 99, promotedAt: ago(5), publishedAt: ago(5) });
}

const section = (r: { sections: { key: string; items: { id: string }[] }[] }, key: string) =>
  r.sections.find((s) => s.key === key)!;

describe("generateReport (daily) + public read (real Postgres)", () => {
  test("assembles the three sections deterministically from DB events", async () => {
    await seedDay();
    const result = await generateReport("daily", NOW);

    expect(result.status).toBe("published");
    expect(result.date).toBe(appCalendarDate(NOW));
    expect(result.counts).toEqual({ focus: 2, watching: 1, followup: 1 });

    const report = await getLatestDaily();
    expect(report).not.toBeNull();
    expect(report!.title).toBe("Claude / 企业智能体 / 双语 ASR · 05.24 早报");
    expect(report!.keywords).toEqual(["Claude", "企业智能体", "双语 ASR"]);
    expect(report!.reading_path?.[0]).toContain("S focus → B focus → watch hi");
    expect(section(report!, "today_focus").items.map((i) => i.id)).toEqual(["s1", "b1"]);
    expect(section(report!, "worth_watching").items.map((i) => i.id)).toEqual(["w_hi"]);
    expect(section(report!, "yesterday_followup").items.map((i) => i.id)).toEqual(["a_prev"]);
  });

  test("maps the main post url into report items", async () => {
    await seedDay();
    await generateReport("daily", NOW);
    const report = await getLatestDaily();
    const s1 = section(report!, "today_focus").items.find((i) => i.id === "s1") as unknown as {
      url: string;
    };
    expect(s1.url).toBe("https://openai.com/x");
  });

  test("regenerating the same date upserts in place (no duplicate rows)", async () => {
    await seedDay();
    await generateReport("daily", NOW);
    await generateReport("daily", NOW);
    const all = await listDailies(50);
    expect(all.filter((d) => d.date === appCalendarDate(NOW))).toHaveLength(1);
  });

  test("getDailyByDate returns the report for an exact date and null otherwise", async () => {
    await seedDay();
    await generateReport("daily", NOW);
    const hit = await getDailyByDate(appCalendarDate(NOW));
    expect(hit).not.toBeNull();
    const miss = await getDailyByDate("2000-01-01");
    expect(miss).toBeNull();
  });

  test("weekly reports auto-publish (点11) but never leak into the daily queries", async () => {
    await seedDay();
    const weekly = await generateReport("weekly", new Date("2026-05-25T00:30:00Z"));
    expect(weekly.status).toBe("published");
    expect(await getLatestDaily()).toBeNull(); // kind filter: weekly is not a daily
    expect(await listDailies()).toHaveLength(0);
    const { getLatestByKind } = await import("@/db/queries/public-reports");
    const publicWeekly = await getLatestByKind("weekly");
    expect(publicWeekly).not.toBeNull();
    expect(publicWeekly!.kind).toBe("weekly");
  });

  test("GET /api/public/daily returns the report JSON with long CDN cache headers", async () => {
    await seedDay();
    await generateReport("daily", NOW);
    const { GET } = await import("@/app/api/public/daily/route");

    const res = await GET(new Request("http://localhost/api/public/daily"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
    const body = (await res.json()) as { sections: unknown[]; generated_at: string };
    expect(Array.isArray(body.sections)).toBe(true);
    expect(typeof body.generated_at).toBe("string");
  });

  test("GET /api/public/daily/{date} validates the date and 404s when absent", async () => {
    const { GET } = await import("@/app/api/public/daily/[date]/route");
    const bad = await GET(new Request("http://localhost/api/public/daily/nope"), {
      params: Promise.resolve({ date: "nope" }),
    });
    expect(bad.status).toBe(400);

    const missing = await GET(new Request("http://localhost/api/public/daily/2000-01-01"), {
      params: Promise.resolve({ date: "2000-01-01" }),
    });
    expect(missing.status).toBe(404);
  });

  test("GET /api/public/dailies lists recent published dailies", async () => {
    await seedDay();
    await generateReport("daily", NOW);
    const { GET } = await import("@/app/api/public/dailies/route");
    const res = await GET(new Request("http://localhost/api/public/dailies?take=5"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dailies: { date: string }[] };
    expect(body.dailies.length).toBeGreaterThanOrEqual(1);
  });
});
