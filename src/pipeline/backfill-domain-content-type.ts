// Category backfill. Deterministically maps known legacy categories into the current public
// article categories, then re-derives unknown/null categories via the same triage route used by
// the live pipeline. LLM calls still honor spend_guard and fail closed.
//
// This supersedes the old single-axis backfill-content-type.ts: setting the domain re-derives the
// content_type alongside it, so there is no longer a content_type-only pass. Only the denormalized
// events columns are written; the append-only event_judgments rows are left untouched.

import { eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";
import { readBudgetCaps } from "@/llm/budget";
import { checkLlmBudget, recordLlmSpend } from "@/db/queries/llm-spend";
import { getRouteConfig, resolveProvider } from "@/llm/routing";
import { structuredGenerateWithRetry } from "@/llm/structured";
import { LIGHT_JUDGE_SYSTEM } from "@/pipeline/prompts";
import {
  INTELLIGENCE_DOMAINS,
  lightJudgeSchema,
  type ContentType,
  type IntelligenceDomain,
  type LightDomain,
  type LightJudge,
} from "@/pipeline/judge-schema";

const DEFAULT_BATCH = 200;

/** Triage result for one event: a domain (or "trash" to skip) + a content type. */
export interface DomainClassification {
  domain: LightDomain;
  contentType: ContentType;
}

const LEGACY_DOMAIN_MAP: Record<string, IntelligenceDomain> = {
  large_model: "product",
  product_app: "product",
  framework_tools: "technology",
  research_paper: "technology",
  safety_align: "technology",
  industry_biz: "discussion",
  Core_Research: "technology",
  Dev_Stack: "technology",
  Product_Business: "product",
  Practical_Build: "tips",
};

/** Classifies one event into the dual axes. Pluggable for tests. */
export type ClassifyFn = (
  event: { title: string; summary: string | null },
) => Promise<DomainClassification>;

/** Raised when the light_judge route has no usable provider (fail-closed). */
export class NoProviderConfiguredError extends Error {}
/** Raised when the monthly LLM budget is exhausted (spend_guard fail-closed at 100%). */
export class BudgetExceededError extends Error {}

export interface BackfillSummary {
  scanned: number;
  /** Rows that got a fresh domain + content_type. */
  reclassified: number;
  /** Rows the triage now considers out of scope (domain === "trash") — left for human review. */
  skippedTrash: number;
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

/** Default classifier: same triage route + spend_guard as the live pipeline. */
function makeDefaultClassify(db: DB): ClassifyFn {
  return async (event) => {
    const route = getRouteConfig("light_judge");
    const provider = resolveProvider("light_judge");
    if (!provider) {
      throw new NoProviderConfiguredError("[backfill-domain] no light_judge provider configured");
    }
    const isStub = provider.name === "stub";

    if (!isStub) {
      const caps = readBudgetCaps();
      const { status, monthToDateUsd } = await checkLlmBudget(caps.llmUsd, db);
      if (status === "block") {
        throw new BudgetExceededError(
          `[backfill-domain] monthly LLM budget exhausted ($${monthToDateUsd.toFixed(2)} / $${caps.llmUsd})`,
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
    return { domain: result.value.domain, contentType: result.value.content_type };
  };
}

/**
 * Backfill domain + content_type for events still missing a canonical domain. Returns a summary.
 * Fail-closed: a missing provider or an exhausted budget stops the run (we don't fabricate a
 * classification); a "trash" verdict leaves the row untouched (human review, not corruption);
 * per-event provider / schema errors are counted and skipped so one bad row doesn't abort the batch.
 */
export async function backfillDomainContentType(deps: BackfillDeps = {}): Promise<BackfillSummary> {
  const db = deps.db ?? defaultDb;
  const classify = deps.classify ?? makeDefaultClassify(db);
  const limit = deps.limit ?? DEFAULT_BATCH;

  // Rows still needing a real category: null, or any value not in the current canonical set.
  const rows = await db
    .select({ id: events.id, title: events.title, summary: events.summary, category: events.category })
    .from(events)
    .where(or(isNull(events.category), notInArray(events.category, [...INTELLIGENCE_DOMAINS])))
    .orderBy(sql`${events.createdAt} desc`)
    .limit(limit);

  const summary: BackfillSummary = {
    scanned: rows.length,
    reclassified: 0,
    skippedTrash: 0,
    failed: 0,
    errored: 0,
    budgetStopped: false,
    noProvider: false,
  };

  for (const row of rows) {
    try {
      const mapped = row.category ? LEGACY_DOMAIN_MAP[row.category] : undefined;
      if (mapped) {
        await db.update(events).set({ category: mapped }).where(eq(events.id, row.id));
        summary.reclassified++;
        continue;
      }

      const { domain, contentType } = await classify({ title: row.title, summary: row.summary });
      if (domain === "trash") {
        summary.skippedTrash++;
        continue;
      }
      await db.update(events).set({ category: domain, contentType }).where(eq(events.id, row.id));
      summary.reclassified++;
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
      console.error(`[backfill-domain] failed to reclassify event ${row.id}:`, error);
    }
  }

  return summary;
}
