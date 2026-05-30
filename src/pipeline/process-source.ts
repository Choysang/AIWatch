// Event-formation pipeline (decision 12). For each fetched RawPost:
//   $0 gate -> normalize -> persist post (dedup) -> event resolution (canonical URL)
//   -> cold_judge (immutable LLM input) -> deterministic base_score -> append-only event.
// The Event is the scoring object; duplicates enrich an event instead of multiplying LLM cost.

import { eq } from "drizzle-orm";
import type { RawPost } from "@/connectors/types";
import { db as defaultDb, type DB } from "@/db/client";
import { deterministicGate } from "@/core/gate";
import {
  attachPostToEvent,
  createEventFromPost,
  findEventIdByCanonicalUrl,
} from "@/db/queries/events";
import { insertPostIfNew } from "@/db/queries/posts";
import type { DueSource } from "@/db/queries/sources";
import { posts } from "@/db/schema";
import { llmRouting, resolveProvider, routingConfigVersion } from "@/llm/routing";
import {
  LlmProviderError,
  LlmSchemaError,
  structuredGenerateWithRetry,
} from "@/llm/structured";
import { readBudgetCaps } from "@/llm/budget";
import { checkLlmBudget, recordLlmSpend } from "@/db/queries/llm-spend";
import { computeBaseScore } from "@/scoring/base-score";
import { scoringConfig } from "@/scoring/config";
import { externalHeatScore } from "@/scoring/external-heat";
import { coldJudgeSchema, type ColdJudge } from "./judge-schema";
import { normalizePost } from "./normalize";

export interface ProcessSummary {
  fetched: number;
  dropped: number; // failed the $0 gate
  duplicates: number; // post already seen for this source
  merged: number; // attached to an existing event (same canonical URL)
  newEvents: number;
  failed: number; // judge/score/persist error
  /** Subset of `failed`: posts where the cold_judge route had no configured provider. */
  judgeFailedNoKey: number;
  /** Subset of `failed`: the provider returned but its output failed Zod twice. */
  judgeFailedSchema: number;
  /** Subset of `failed`: provider call itself errored (network/upstream/transport). */
  judgeFailedProvider: number;
  /** Subset of `failed`: the monthly LLM budget was exhausted (spend_guard fail-closed). */
  judgeFailedBudget: number;
}

/** Pluggable for tests: produce a validated cold-judge result for a post. */
export type JudgeFn = (raw: RawPost) => Promise<ColdJudge>;

const COLD_JUDGE_SYSTEM =
  "你是 AIWatch 的判断器。只输出结构化评分（0-100）与中文摘要/分类/标签/推荐理由，不做最终编辑决策。";

function buildJudgePrompt(raw: RawPost): string {
  return [
    `标题: ${raw.rawTitle ?? "(无)"}`,
    `内容: ${raw.rawContent ?? "(无)"}`,
    `来源链接: ${raw.url ?? "(无)"}`,
  ].join("\n");
}

/** Thrown when the cold_judge route has no usable provider configured. */
class NoProviderConfiguredError extends Error {}

/** Thrown when the monthly LLM budget is exhausted (spend_guard fail-closed at 100%). The
 *  caller marks the post `judge_failed` reason `budget_exceeded` — no event is created and
 *  no provider call is made, so the cap can't be overshot by an in-flight batch. */
class BudgetExceededError extends Error {}

/** Default judge: route to the configured provider, schema-validated with retry-once,
 *  guarded by spend_guard. Fail-closed semantics: when no provider is available, or the
 *  monthly budget is exhausted, we throw rather than silently degrading — the caller marks
 *  the post `judge_failed`. A db handle is captured so the budget gate and ledger write
 *  use the same connection as the rest of the pipeline. */
function makeDefaultJudge(db: DB): JudgeFn {
  return async (raw: RawPost): Promise<ColdJudge> => {
    const route = llmRouting.cold_judge;
    const provider = resolveProvider("cold_judge");
    if (!provider) {
      throw new NoProviderConfiguredError(
        `[cold_judge] no provider configured for route ${route.provider}`,
      );
    }
    const isStub = provider.name === "stub";

    // Pre-call budget gate: only real (paid) providers consult the ledger; the stub spends
    // nothing. block => fail closed before the call; warn => proceed but log (no optional
    // work to shed on this route yet).
    if (!isStub) {
      const caps = readBudgetCaps();
      const { status, monthToDateUsd } = await checkLlmBudget(caps.llmUsd, db);
      if (status === "block") {
        throw new BudgetExceededError(
          `[cold_judge] monthly LLM budget exhausted ($${monthToDateUsd.toFixed(2)} / $${caps.llmUsd}) — failing closed`,
        );
      }
      if (status === "warn") {
        // eslint-disable-next-line no-console -- worker-side structured logging lands in a later slice
        console.warn(
          `[spend_guard] LLM spend $${monthToDateUsd.toFixed(2)} of $${caps.llmUsd} cap (≥80%)`,
        );
      }
    }

    const result = await structuredGenerateWithRetry<ColdJudge>(provider, {
      model: route.model,
      schema: coldJudgeSchema,
      temperature: route.temperature,
      maxOutputTokens: route.maxOutputTokens,
      messages: [
        { role: "system", content: COLD_JUDGE_SYSTEM },
        { role: "user", content: buildJudgePrompt(raw) },
      ],
    });

    // Post-call ledger write: priced models only (recordLlmSpend skips unpriced -> null).
    if (!isStub) {
      await recordLlmSpend(
        { task: "cold_judge", provider: route.provider, model: route.model, usage: result.usage },
        db,
      );
    }
    return result.value;
  };
}

export interface ProcessDeps {
  db?: DB;
  judge?: JudgeFn;
}

export async function processSource(
  source: DueSource,
  rawPosts: RawPost[],
  deps: ProcessDeps = {},
): Promise<ProcessSummary> {
  const db = deps.db ?? defaultDb;
  const judge = deps.judge ?? makeDefaultJudge(db);
  const route = llmRouting.cold_judge;

  const summary: ProcessSummary = {
    fetched: rawPosts.length,
    dropped: 0,
    duplicates: 0,
    merged: 0,
    newEvents: 0,
    failed: 0,
    judgeFailedNoKey: 0,
    judgeFailedSchema: 0,
    judgeFailedProvider: 0,
    judgeFailedBudget: 0,
  };

  for (const raw of rawPosts) {
    if (!deterministicGate({ title: raw.rawTitle, content: raw.rawContent }).pass) {
      summary.dropped++;
      continue;
    }

    const norm = normalizePost(raw);
    const post = await insertPostIfNew(source.id, source.platform, raw, norm, db);
    if (!post.inserted) {
      summary.duplicates++;
      continue;
    }

    // Same-event merge: attach to an existing event sharing this canonical URL.
    if (norm.canonicalUrl) {
      const existingEventId = await findEventIdByCanonicalUrl(norm.canonicalUrl, db);
      if (existingEventId) {
        await attachPostToEvent(existingEventId, post.id, "same_event", db);
        summary.merged++;
        continue;
      }
    }

    try {
      const judgment = await judge(raw);
      const externalHeat = externalHeatScore(raw.publicMetrics, source.platform);
      const { baseScore, breakdown } = computeBaseScore({
        sourceLevel: source.level,
        dimensions: {
          aiRelevance: judgment.aiRelevance,
          impact: judgment.impact,
          novelty: judgment.novelty,
          audienceUsefulness: judgment.audienceUsefulness,
          evidenceClarity: judgment.evidenceClarity,
        },
        externalHeat,
      });

      const provider = resolveProvider("cold_judge");
      // Provider must still resolve here — if it disappeared between judge() and now
      // (env race), prefer to mark judge_failed rather than stamp the wrong provider.
      if (!provider) {
        await markJudgeFailed(db, post.id, "no_key");
        summary.failed++;
        summary.judgeFailedNoKey++;
        continue;
      }
      const isStub = provider.name === "stub";
      await createEventFromPost(
        {
          source: { id: source.id, level: source.level },
          post: { id: post.id, publishedAt: raw.publishedAt ?? null },
          judgment,
          routing: {
            provider: provider.name,
            modelId: isStub ? "stub" : route.model,
            promptVersion: route.promptVersion,
            routingConfigVersion,
          },
          // Slice 0: quality = base = rank; display = round(base).
          scoring: {
            configVersion: scoringConfig.version,
            baseScore,
            qualityScore: baseScore,
            rankScore: baseScore,
            displayScore: Math.round(baseScore),
            breakdown,
          },
        },
        db,
      );
      summary.newEvents++;
    } catch (error) {
      summary.failed++;
      if (error instanceof NoProviderConfiguredError) {
        await markJudgeFailed(db, post.id, "no_key");
        summary.judgeFailedNoKey++;
      } else if (error instanceof BudgetExceededError) {
        await markJudgeFailed(db, post.id, "budget_exceeded");
        summary.judgeFailedBudget++;
      } else if (error instanceof LlmSchemaError) {
        await markJudgeFailed(db, post.id, "schema_invalid");
        summary.judgeFailedSchema++;
      } else if (error instanceof LlmProviderError) {
        await markJudgeFailed(db, post.id, "provider_error");
        summary.judgeFailedProvider++;
      } else {
        await markJudgeFailed(db, post.id, "unknown");
      }
      // eslint-disable-next-line no-console -- worker-side structured logging lands in a later slice
      console.error(`[pipeline] judge/score failed for post ${post.id}:`, error);
    }
  }

  return summary;
}

/** Stamp posts.judgeError so the post is excluded from event creation until cleared. */
async function markJudgeFailed(db: DB, postId: string, reason: string): Promise<void> {
  await db
    .update(posts)
    .set({ judgeError: reason, judgeFailedAt: new Date() })
    .where(eq(posts.id, postId));
}
