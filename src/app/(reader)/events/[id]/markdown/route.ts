import { htmlToReadableText } from "@/app/_lib/html-text";
import { getEventDetail } from "@/db/queries/event-detail";

export const dynamic = "force-dynamic";

const APP_TZ = process.env.APP_TZ ?? "Asia/Shanghai";

const exportDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function originFrom(reqUrl: URL): string {
  return (process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || reqUrl.origin).replace(/\/+$/, "");
}

function fileSlug(input: string): string {
  const slug = input
    .trim()
    .replace(/[\\/:*?"<>|#\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "aiwatch-note";
}

function formatExportDate(value: Date | null): string {
  if (!value) return "未知";
  return exportDateFmt.format(value).replace(",", "");
}

function buildMarkdown({
  title,
  sourceName,
  publishedAt,
  promotedAt,
  qualityScore,
  selectedLevel,
  selectedLabel,
  aiwatchUrl,
  originalUrl,
  recommendationReason,
  summary,
  body,
}: {
  title: string;
  sourceName: string | null;
  publishedAt: Date | null;
  promotedAt: Date | null;
  qualityScore: number | null;
  selectedLevel: "none" | "B" | "A" | "S";
  selectedLabel: string | null;
  aiwatchUrl: string;
  originalUrl: string | null;
  recommendationReason: string | null;
  summary: string | null;
  body: string | null;
}): string {
  return [
    `# ${title}`,
    "",
    `- 来源：${sourceName ?? "未知"}`,
    `- 发布时间：${formatExportDate(publishedAt ?? promotedAt)}`,
    `- AIWatch 分数：${qualityScore ?? "未评分"}`,
    `- AIWatch 标记：${selectedLevel === "none" ? "未精选" : (selectedLabel ?? selectedLevel)}`,
    `- AIWatch 链接：${aiwatchUrl}`,
    `- 原文链接：${originalUrl ?? "暂无"}`,
    "",
    "## 精选理由",
    "",
    recommendationReason?.trim() || "暂无精选理由。",
    "",
    "## AI 摘要",
    "",
    summary?.trim() || "暂无摘要。",
    "",
    "## 正文",
    "",
    body?.trim() || summary?.trim() || "暂无正文。",
    "",
  ].join("\n");
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const event = await getEventDetail(id);
  if (!event) return new Response("Not found", { status: 404 });

  const origin = originFrom(new URL(req.url));
  const body = event.rawContent ? htmlToReadableText(event.rawContent) : null;
  const markdown = buildMarkdown({
    title: event.title,
    sourceName: event.sourceName,
    publishedAt: event.publishedAt,
    promotedAt: event.promotedAt,
    qualityScore: event.qualityScore,
    selectedLevel: event.selectedLevel,
    selectedLabel: event.selectedLabel,
    aiwatchUrl: `${origin}/events/${event.id}`,
    originalUrl: event.url,
    recommendationReason: event.recommendationReason,
    summary: event.summary,
    body,
  });

  const filename = `${fileSlug(event.title)}.md`;
  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="aiwatch-note.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
