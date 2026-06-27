// POST /api/events/[id]/translate — event-scoped source-body translation.
// The client sends no arbitrary text; the server loads the event body/fulltext, truncates it,
// and asks the configured LLM route to produce Simplified Chinese while preserving AI terms.

import { z } from "zod";
import { htmlToReadableText } from "@/app/_lib/html-text";
import { getEventDetail } from "@/db/queries/event-detail";
import { getOrExtractFulltext } from "@/db/queries/article-fulltext";
import { checkLlmBudget, recordLlmSpend } from "@/db/queries/llm-spend";
import { readBudgetCaps } from "@/llm/budget";
import { getRouteConfig, resolveProvider } from "@/llm/routing";
import { structuredGenerateWithRetry } from "@/llm/structured";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 12_000;

const translationSchema = z.object({
  translated_text: z.string().min(1),
});

function truncateForTranslation(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_SOURCE_CHARS ? trimmed.slice(0, MAX_SOURCE_CHARS) : trimmed;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") return jsonError(400, "invalid_event_id");

  const ip = clientIp(req);
  const rl = publicLimiter.check(`translate:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }

  const route = getRouteConfig("translation");
  const provider = resolveProvider("translation");
  if (!provider) return jsonError(503, "no_translation_provider");

  const event = await getEventDetail(id);
  if (!event) return jsonError(404, "event_not_found");

  const full = await getOrExtractFulltext(id);
  const fallback = event.rawContent ? htmlToReadableText(event.rawContent) : "";
  const sourceText = truncateForTranslation(full.status === "ok" && full.text ? full.text : fallback);
  if (!sourceText) return jsonError(404, "no_source_text");

  const isStub = provider.name === "stub";
  if (!isStub) {
    const caps = readBudgetCaps();
    const budget = await checkLlmBudget(caps.llmUsd);
    if (budget.status === "block") return jsonError(429, "llm_budget_exhausted");
  }

  try {
    const result = await structuredGenerateWithRetry(provider, {
      model: route.model,
      schema: translationSchema,
      temperature: route.temperature,
      maxOutputTokens: route.maxOutputTokens,
      messages: [
        {
          role: "system",
          content:
            "你是 AI HOT 的中文技术译者。把输入翻译成简体中文，保留模型名、产品名、API、benchmark、论文术语等英文原词；不要添加原文没有的信息；只返回符合 schema 的 JSON。",
        },
        { role: "user", content: sourceText },
      ],
    });

    if (!isStub) {
      await recordLlmSpend({ task: "translation", provider: route.provider, model: route.model, usage: result.usage });
    }

    return Response.json(result.value, {
      headers: { "cache-control": "private, max-age=3600" },
    });
  } catch {
    return jsonError(500, "translation_failed");
  }
}
