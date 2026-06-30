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

function fallbackAnswer(
  question: string,
  events: Awaited<ReturnType<typeof searchEvents>>,
): string {
  const top = events.slice(0, 5);
  if (top.length === 0) {
    return [
      "AI 管家目前先给你站内导航建议：先看「最新」确认今天是否有新动态，再看「热点榜」找多信源同时报道的事件，最后进入「日报」读编辑好的阅读路径。",
      `你的问题是：「${question}」。如果要查公司或主题，可以在顶部搜索框输入关键词。`,
    ].join("\n\n");
  }
  const items = top
    .map((event, index) => `${index + 1}. ${event.title}${event.sourceName ? `（${event.sourceName}）` : ""}`)
    .join("\n");
  return [
    "模型通道暂时不可用，我先按 AIWatch 最近资讯给你一个保守读法：",
    items,
    "建议先点开多信源/高分条目看详情；如果你问的是某家公司，继续用搜索框按公司名过滤会更准。",
  ].join("\n\n");
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = publicLimiter.check(`assistant:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_question");

  const events = await searchEvents({ mode: "all", since: "week" }, 20);
  const route = getRouteConfig("translation");
  const provider = resolveProvider("translation");
  if (!provider) {
    return Response.json({ answer: fallbackAnswer(parsed.data.question, events) }, {
      headers: { "cache-control": "private, no-store" },
    });
  }

  const isStub = provider.name === "stub";
  if (!isStub) {
    const budget = await checkLlmBudget(readBudgetCaps().llmUsd);
    if (budget.status === "block") {
      return Response.json({ answer: fallbackAnswer(parsed.data.question, events) }, {
        headers: { "cache-control": "private, no-store" },
      });
    }
  }

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
    return Response.json({ answer: fallbackAnswer(parsed.data.question, events) }, {
      headers: { "cache-control": "private, no-store" },
    });
  }
}
