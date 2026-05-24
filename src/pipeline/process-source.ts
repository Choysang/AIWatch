// Event-formation pipeline (decision 12). For each fetched RawPost:
//   $0 gate -> normalize -> persist post (dedup) -> event resolution (canonical URL)
//   -> cold_judge (immutable LLM input) -> deterministic base_score -> append-only event.
// The Event is the scoring object; duplicates enrich an event instead of multiplying LLM cost.

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
import { llmRouting, resolveProvider, routingConfigVersion } from "@/llm/routing";
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

/** Default judge: route to the configured provider (stub in Slice 0), schema-validated. */
async function defaultJudge(raw: RawPost): Promise<ColdJudge> {
  const route = llmRouting.cold_judge;
  const provider = resolveProvider("cold_judge");
  return provider.structuredGenerate<ColdJudge>({
    model: route.model,
    schema: coldJudgeSchema,
    temperature: route.temperature,
    maxOutputTokens: route.maxOutputTokens,
    messages: [
      { role: "system", content: COLD_JUDGE_SYSTEM },
      { role: "user", content: buildJudgePrompt(raw) },
    ],
  });
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
  const judge = deps.judge ?? defaultJudge;
  const route = llmRouting.cold_judge;

  const summary: ProcessSummary = {
    fetched: rawPosts.length,
    dropped: 0,
    duplicates: 0,
    merged: 0,
    newEvents: 0,
    failed: 0,
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
      // eslint-disable-next-line no-console -- worker-side structured logging lands in a later slice
      console.error(`[pipeline] judge/score failed for post ${post.id}:`, error);
    }
  }

  return summary;
}
