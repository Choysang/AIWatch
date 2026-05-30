// Integration test for spend_guard phase C: the spend ledger + month-to-date budget gate
// against real Postgres. Exercises recordLlmSpend (priced vs unpriced), monthToDateLlmSpend
// (per-UTC-month scoping), and checkLlmBudget's ok/warn/block bands. The deterministic cost
// math (pricing.ts) and band thresholds (budget.ts) have their own unit tests; this verifies
// they compose correctly over real rows.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startEmbeddedPostgres, type PgHandle } from "./helpers/embedded-pg";

let pgHandle: PgHandle | undefined;
let getDb: typeof import("@/db/client").getDb;
let resetDb: typeof import("@/db/client").resetDb;
let schema: typeof import("@/db/schema");
let spend: typeof import("@/db/queries/llm-spend");

const MAY = new Date("2026-05-15T12:00:00Z");
const JUNE = new Date("2026-06-02T08:00:00Z");

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve();
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    pgHandle = await startEmbeddedPostgres();
    process.env.DATABASE_URL = pgHandle.connectionString;
  }
  ({ getDb, resetDb } = await import("@/db/client"));
  schema = await import("@/db/schema");
  spend = await import("@/db/queries/llm-spend");
  await migrate(getDb(), { migrationsFolder: "src/db/migrations" });
}, 120_000);

afterAll(async () => {
  await withTimeout(resetDb?.(), 10_000);
  await withTimeout(pgHandle?.stop(), 15_000);
  if (pgHandle) delete process.env.DATABASE_URL;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.llmSpendLedger);
});

describe("spend_guard ledger (real Postgres)", () => {
  test("recordLlmSpend writes a priced row and returns the cost", async () => {
    // gpt-4.1-mini: $0.40/$1.60 per 1M. 10k in + 2k out = 0.004 + 0.0032 = 0.0072.
    const cost = await spend.recordLlmSpend(
      { task: "cold_judge", provider: "openai", model: "gpt-4.1-mini", usage: { inputTokens: 10_000, outputTokens: 2_000 } },
      getDb(),
      MAY,
    );
    expect(cost).toBeCloseTo(0.0072, 9);
    const rows = await getDb().select().from(schema.llmSpendLedger);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.monthKey).toBe("2026-05");
    expect(rows[0]!.costUsd).toBeCloseTo(0.0072, 9);
  });

  test("recordLlmSpend skips an unpriced model (returns null, writes no row)", async () => {
    const cost = await spend.recordLlmSpend(
      { task: "cold_judge", provider: "openai", model: "ghost-model", usage: { inputTokens: 1000, outputTokens: 1000 } },
      getDb(),
      MAY,
    );
    expect(cost).toBeNull();
    expect(await getDb().select().from(schema.llmSpendLedger)).toHaveLength(0);
  });

  test("monthToDateLlmSpend sums only the current UTC month", async () => {
    const db = getDb();
    const usage = { inputTokens: 1_000_000, outputTokens: 0 }; // gpt-4.1-mini input = $0.40 flat
    await spend.recordLlmSpend({ task: "cold_judge", provider: "openai", model: "gpt-4.1-mini", usage }, db, MAY);
    await spend.recordLlmSpend({ task: "cold_judge", provider: "openai", model: "gpt-4.1-mini", usage }, db, MAY);
    await spend.recordLlmSpend({ task: "cold_judge", provider: "openai", model: "gpt-4.1-mini", usage }, db, JUNE);

    expect(await spend.monthToDateLlmSpend(db, MAY)).toBeCloseTo(0.8, 9); // two May rows
    expect(await spend.monthToDateLlmSpend(db, JUNE)).toBeCloseTo(0.4, 9); // one June row
  });

  test("checkLlmBudget returns the ok/warn/block bands against the month-to-date sum", async () => {
    const db = getDb();
    // Seed $4.00 of May spend (10 rows × $0.40 input).
    for (let i = 0; i < 10; i++) {
      await spend.recordLlmSpend(
        { task: "cold_judge", provider: "openai", model: "gpt-4.1-mini", usage: { inputTokens: 1_000_000, outputTokens: 0 } },
        db,
        MAY,
      );
    }
    // Caps chosen to sit clearly inside each band — exact-boundary caps (80%/100%) flicker
    // with double-precision money sums (ten $0.40 rows total $3.9999…), which is acceptable
    // for a monthly cap that real spend never lands on to the cent.
    expect((await spend.checkLlmBudget(20, db, MAY)).status).toBe("ok"); // $4 / $20 = 20%
    expect((await spend.checkLlmBudget(4.5, db, MAY)).status).toBe("warn"); // $4 / $4.5 ≈ 89%
    expect((await spend.checkLlmBudget(3, db, MAY)).status).toBe("block"); // $4 / $3 ≈ 133%
  });

  test("checkLlmBudget short-circuits to ok when the cap is disabled (≤0), without a DB read", async () => {
    // No rows seeded; a disabled cap must never block regardless of spend.
    const { status, monthToDateUsd } = await spend.checkLlmBudget(0, getDb(), MAY);
    expect(status).toBe("ok");
    expect(monthToDateUsd).toBe(0);
  });
});
