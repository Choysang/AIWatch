// 点9 backfill: events judged before the Chinese-forced prompts (light-judge-v3+) kept
// their English raw titles/summaries. Re-run the light triage (v4 prompt → Chinese
// one_line_summary) for events whose display title is essentially CJK-free, then rewrite
// the denormalized title/summary the cards show. Append-only event_judgments rows are
// left untouched, mirroring backfill-domain-content-type.ts.

import { eq, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";
import { readBudgetCaps } from "@/llm/budget";
import { checkLlmBudget, recordLlmSpend } from "@/db/queries/llm-spend";
import { getRouteConfig, resolveProvider } from "@/llm/routing";
import { structuredGenerateWithRetry } from "@/llm/structured";
import { LIGHT_JUDGE_SYSTEM } from "@/pipeline/prompts";
import { lightJudgeSchema, type LightJudge } from "@/pipeline/judge-schema";
import {
  BudgetExceededError,
  NoProviderConfiguredError,
} from "@/pipeline/backfill-domain-content-type";

const DEFAULT_BATCH = 100;

/** Produces the Chinese one-line summary for one event. Pluggable for tests. */
export type SummarizeFn = (
  event: { title: string; summary: string | null },
) => Promise<string>;

export interface ChineseTextBackfillSummary {
  scanned: number;
  rewritten: number;
  /** LLM returned a still-non-Chinese line — row left untouched for review. */
  skippedNonChinese: number;
  failed: number;
  budgetStopped: boolean;
  noProvider: boolean;
}

export interface ChineseTextBackfillDeps {
  db?: DB;
  summarize?: SummarizeFn;
  limit?: number;
}

const CJK_RE = /[一-鿿]/;

function cleanTitle(oneLineSummary: string): string {
  return oneLineSummary.replace(/[。.!！?？]\s*$/, "").slice(0, 200);
}

function makeDefaultSummarize(db: DB): SummarizeFn {
  return async (event) => {
    const route = getRouteConfig("light_judge");
    const provider = resolveProvider("light_judge");
    if (!provider) {
      throw new NoProviderConfiguredError("[backfill-zh] no light_judge provider configured");
    }
    const isStub = provider.name === "stub";

    if (!isStub) {
      const caps = readBudgetCaps();
      const { status, monthToDateUsd } = await checkLlmBudget(caps.llmUsd, db);
      if (status === "block") {
        throw new BudgetExceededError(
          `[backfill-zh] monthly LLM budget exhausted ($${monthToDateUsd.toFixed(2)} / $${caps.llmUsd})`,
        );
      }
    }

    const result = await structuredGenerateWithRetry<LightJudge>(provider, {
      model: route.model,
      schema: lightJudgeSchema,
      temperature: route.temperature,
      maxOutputTokens: route.maxOutputTokens,
      messages: [
        { role: "system", content: LIGHT_JUDGE_SYSTEM },
        { role: "user", content: `标题: ${event.title}\n摘要: ${event.summary ?? "(无)"}` },
      ],
    });

    if (!isStub) {
      const costUsd = await recordLlmSpend(
        { task: "light_judge", provider: route.provider, model: route.model, usage: result.usage },
        db,
      );
      if (costUsd === null) {
        console.warn(
          `[spend_guard] no price entry for ${route.provider}::${route.model} — call NOT recorded in spend ledger`,
        );
      }
    }
    return result.value.one_line_summary;
  };
}

/**
 * Rewrite English-titled events with a Chinese title (and summary, when the summary is
 * also CJK-free). Fail-closed on missing provider / exhausted budget; a per-row error
 * skips that row only.
 */
export async function backfillChineseText(
  deps: ChineseTextBackfillDeps = {},
): Promise<ChineseTextBackfillSummary> {
  const db = deps.db ?? defaultDb;
  const summarize = deps.summarize ?? makeDefaultSummarize(db);
  const limit = deps.limit ?? DEFAULT_BATCH;

  const rows = await db
    .select({ id: events.id, title: events.title, summary: events.summary })
    .from(events)
    .where(sql`${events.title} !~ '[一-鿿]'`)
    .orderBy(sql`${events.createdAt} desc`)
    .limit(limit);

  const summary: ChineseTextBackfillSummary = {
    scanned: rows.length,
    rewritten: 0,
    skippedNonChinese: 0,
    failed: 0,
    budgetStopped: false,
    noProvider: false,
  };

  for (const row of rows) {
    try {
      const oneLine = await summarize({ title: row.title, summary: row.summary });
      if (!CJK_RE.test(oneLine)) {
        summary.skippedNonChinese++;
        continue;
      }
      const patch: { title: string; summary?: string } = { title: cleanTitle(oneLine) };
      if (!row.summary || !CJK_RE.test(row.summary)) patch.summary = oneLine;
      await db.update(events).set(patch).where(eq(events.id, row.id));
      summary.rewritten++;
    } catch (error) {
      summary.failed++;
      if (error instanceof BudgetExceededError) {
        summary.budgetStopped = true;
        break;
      }
      if (error instanceof NoProviderConfiguredError) {
        summary.noProvider = true;
        break;
      }
      // eslint-disable-next-line no-console -- one-time script; per-row diagnostics are useful
      console.error(`[backfill-zh] failed to rewrite event ${row.id}:`, error);
    }
  }

  return summary;
}
