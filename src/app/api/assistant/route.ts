import { z } from "zod";
import { searchEvents } from "@/db/queries/feed";
import { checkLlmBudget, recordLlmSpend } from "@/db/queries/llm-spend";
import { readBudgetCaps } from "@/llm/budget";
import { getRouteConfig, resolveProvider } from "@/llm/routing";
import { structuredGenerateWithRetry } from "@/llm/structured";
import { clientIp, jsonError, publicLimiter } from "../public/_runtime";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().trim().min(1).max(500),
});

const assistantSchema = z.object({
  answer: z.string().min(1),
});

function contextLine(event: Awaited<ReturnType<typeof searchEvents>>[number]): string {
  return [
    event.title,
    event.sourceName ? `信源:${event.sourceName}` : null,
    event.category ? `分类:${event.category}` : null,
    event.selectedLevel !== "none" ? `精选:${event.selectedLevel}` : null,
    event.summary ? `摘要:${event.summary}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = publicLimiter.check(`assistant:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_question");

  const route = getRouteConfig("translation");
  const provider = resolveProvider("translation");
  if (!provider) return jsonError(503, "no_assistant_provider");

  const isStub = provider.name === "stub";
  if (!isStub) {
    const budget = await checkLlmBudget(readBudgetCaps().llmUsd);
    if (budget.status === "block") return jsonError(429, "llm_budget_exhausted");
  }

  const events = await searchEvents({ mode: "all", since: "week" }, 20);
  const context = events.map(contextLine).join("\n").slice(0, 8000);

  try {
    const result = await structuredGenerateWithRetry(provider, {
      model: route.model,
      schema: assistantSchema,
      temperature: 0.2,
      maxOutputTokens: 700,
      messages: [
        {
          role: "system",
          content:
            "你是 AIWatch 的站内 AI 管家。只根据给定的 AIWatch 资讯上下文和站点功能回答；不知道就说需要打开对应页面核对。回答要短、中文、可执行。",
        },
        {
          role: "user",
          content: `站点功能：最新/精选信息流、热点榜、资讯速览、主题板、日报/周报/月报、RSS/API/Skill、反馈和推荐信源。\n\n最近资讯：\n${context}\n\n用户问题：${parsed.data.question}`,
        },
      ],
    });
    if (!isStub) {
      await recordLlmSpend({ task: "translation", provider: route.provider, model: route.model, usage: result.usage });
    }
    return Response.json(result.value, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return jsonError(500, "assistant_failed");
  }
}
