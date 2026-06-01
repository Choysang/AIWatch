// One-time backfill for events created before content_type existed (SP2 point 5).
// Re-classifies each legacy event (content_type IS NULL) through the SAME cold_judge route
// the live pipeline uses — fail-closed and spend_guard-gated — and stamps events.content_type.
//
// Only the denormalized events.content_type is set; the append-only event_judgments rows are
// left untouched (they are immutable LLM inputs — a derived backfill doesn't rewrite history).
// New events never need this: the judge schema requires content_type with no fallback.

import { eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";
import { readBudgetCaps } from "@/llm/budget";
import { checkLlmBudget, recordLlmSpend } from "@/db/queries/llm-spend";
import { llmRouting, resolveProvider } from "@/llm/routing";
import { structuredGenerateWithRetry } from "@/llm/structured";
import { CONTENT_TYPES, type ContentType } from "./judge-schema";

const DEFAULT_BATCH = 200;

const classifySchema = z.object({ contentType: z.enum(CONTENT_TYPES) });

const CLASSIFY_SYSTEM =
  "你是 AIWatch 的内容分类器。根据标题与摘要，从以下四类中选择恰好一个 contentType：" +
  "model_release（模型发布/权重/榜单）、product_release（产品/功能/API 发布）、" +
  "tech_share（论文/技术解析/教程/工程实践）、discussion（观点/讨论/行业动态/其他）。" +
  "无法明确归类时选 discussion。只返回严格符合 schema 的 JSON。";

/** Classifies one event into a ContentType. Pluggable for tests. */
export type ClassifyFn = (event: { title: string; summary: string | null }) => Promise<ContentType>;

/** Raised when the cold_judge route has no usable provider (fail-closed). */
export class NoProviderConfiguredError extends Error {}
/** Raised when the monthly LLM budget is exhausted (spend_guard fail-closed at 100%). */
export class BudgetExceededError extends Error {}

export interface BackfillSummary {
  scanned: number;
  classified: number;
  failed: number;
  /** Subset of failed: provider call / schema errors. */
  errored: number;
  /** Stopped early because the monthly budget is exhausted. */
  budgetStopped: boolean;
  /** Stopped early because no provider is configured. */
  noProvider: boolean;
}

export interface BackfillDeps {
  db?: DB;
  classify?: ClassifyFn;
  /** Max events to process in one run (default 200). */
  limit?: number;
}

/** Default classifier: same route + spend_guard as the live pipeline. */
function makeDefaultClassify(db: DB): ClassifyFn {
  return async (event) => {
    const route = llmRouting.cold_judge;
    const provider = resolveProvider("cold_judge");
    if (!provider) throw new NoProviderConfiguredError("[backfill] no cold_judge provider configured");
    const isStub = provider.name === "stub";

    if (!isStub) {
      const caps = readBudgetCaps();
      const { status, monthToDateUsd } = await checkLlmBudget(caps.llmUsd, db);
      if (status === "block") {
        throw new BudgetExceededError(
          `[backfill] monthly LLM budget exhausted ($${monthToDateUsd.toFixed(2)} / $${caps.llmUsd})`,
        );
      }
    }

    const result = await structuredGenerateWithRetry(provider, {
      model: route.model,
      schema: classifySchema,
      temperature: 0,
      maxOutputTokens: 50,
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM },
        { role: "user", content: `标题: ${event.title}\n摘要: ${event.summary ?? "(无)"}` },
      ],
    });

    if (!isStub) {
      await recordLlmSpend(
        { task: "cold_judge", provider: route.provider, model: route.model, usage: result.usage },
        db,
      );
    }
    return result.value.contentType;
  };
}

/**
 * Backfill content_type for legacy events. Returns a summary. Fail-closed: a missing provider
 * or an exhausted budget stops the run (we don't fabricate a category); per-event provider /
 * schema errors are counted and skipped so one bad row doesn't abort the batch.
 */
export async function backfillContentType(deps: BackfillDeps = {}): Promise<BackfillSummary> {
  const db = deps.db ?? defaultDb;
  const classify = deps.classify ?? makeDefaultClassify(db);
  const limit = deps.limit ?? DEFAULT_BATCH;

  const rows = await db
    .select({ id: events.id, title: events.title, summary: events.summary })
    .from(events)
    .where(isNull(events.contentType))
    .orderBy(sql`${events.createdAt} desc`)
    .limit(limit);

  const summary: BackfillSummary = {
    scanned: rows.length,
    classified: 0,
    failed: 0,
    errored: 0,
    budgetStopped: false,
    noProvider: false,
  };

  for (const row of rows) {
    try {
      const contentType = await classify({ title: row.title, summary: row.summary });
      await db.update(events).set({ contentType }).where(eq(events.id, row.id));
      summary.classified++;
    } catch (error) {
      summary.failed++;
      if (error instanceof BudgetExceededError) {
        summary.budgetStopped = true;
        break; // no point continuing — every remaining row would hit the same gate
      }
      if (error instanceof NoProviderConfiguredError) {
        summary.noProvider = true;
        break;
      }
      summary.errored++;
      // eslint-disable-next-line no-console -- one-time script; per-row diagnostics are useful
      console.error(`[backfill] failed to classify event ${row.id}:`, error);
    }
  }

  return summary;
}
