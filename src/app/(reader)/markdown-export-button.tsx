"use client";

import { useEffect, useRef, useState } from "react";

interface MarkdownExportButtonProps {
  title: string;
  publishedAt: string | null;
  promotedAt: string | null;
  sourceName: string | null;
  category: string | null;
  tags: string[];
  qualityScore: number | null;
  selectedLevel: "none" | "B" | "A" | "S";
  selectedLabel: string | null;
  sourceUrl: string | null;
  originalUrl: string | null;
  aiwatchPath: string;
  summary: string | null;
  recommendationReason: string | null;
  bodyText?: string | null;
}

type ExportFormat = "markdown" | "obsidian" | "json" | "custom";

const RESET_DELAY_MS = 2000;
const TEMPLATE_STORAGE_KEY = "aiwatch.markdownExportTemplate.v1";
const DEFAULT_CUSTOM_TEMPLATE = [
  "{{frontmatter}}",
  "",
  "# {{title}}",
  "",
  "> {{summary}}",
  "",
  "## 为什么值得看",
  "{{recommendation_reason}}",
  "",
  "## 元数据",
  "- 日期：{{date}}",
  "- 来源：{{source}}",
  "- 分类：{{category}}",
  "- 标签：{{tags}}",
  "- 分数：{{score}}",
  "- 原文：{{original_url}}",
  "- AIWatch：{{aiwatch_url}}",
  "",
  "## 正文",
  "{{body}}",
].join("\n");

function slugify(input: string): string {
  const slug = input
    .trim()
    .replace(/[\\/:*?"<>|#\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "aiwatch-note";
}

function yamlString(value: string | null): string {
  return value === null ? "null" : JSON.stringify(value);
}

function markdownList(items: string[]): string {
  if (items.length === 0) return "[]";
  return `\n${items.map((item) => `  - ${yamlString(item)}`).join("\n")}`;
}

function buildAiWatchUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function formatExportDate(value: string | null): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function metadata(input: MarkdownExportButtonProps): Record<string, unknown> {
  return {
    title: input.title,
    date: input.publishedAt ?? input.promotedAt,
    source: input.sourceName,
    category: input.category,
    tags: input.tags.filter(Boolean),
    score: input.qualityScore,
    selected: input.selectedLevel !== "none",
    selected_level: input.selectedLevel,
    selected_label: input.selectedLabel,
    source_url: input.sourceUrl,
    original_url: input.originalUrl,
    aiwatch_url: buildAiWatchUrl(input.aiwatchPath),
  };
}

function frontmatter(input: MarkdownExportButtonProps): string {
  const meta = metadata(input);
  return [
    "---",
    `title: ${yamlString(String(meta.title ?? ""))}`,
    `date: ${yamlString((meta.date as string | null) ?? null)}`,
    `source: ${yamlString((meta.source as string | null) ?? null)}`,
    `category: ${yamlString((meta.category as string | null) ?? null)}`,
    `tags: ${markdownList(meta.tags as string[])}`,
    `score: ${meta.score ?? "null"}`,
    `selected: ${meta.selected ? "true" : "false"}`,
    `selected_level: ${yamlString(meta.selected_level as string)}`,
    `selected_label: ${yamlString((meta.selected_label as string | null) ?? null)}`,
    `source_url: ${yamlString((meta.source_url as string | null) ?? null)}`,
    `original_url: ${yamlString((meta.original_url as string | null) ?? null)}`,
    `aiwatch_url: ${yamlString(meta.aiwatch_url as string)}`,
    "---",
  ].join("\n");
}

function bodySections(input: MarkdownExportButtonProps): string[] {
  const date = formatExportDate(input.publishedAt ?? input.promotedAt);
  const aiwatchUrl = buildAiWatchUrl(input.aiwatchPath);
  const body = input.bodyText?.trim() || input.summary?.trim() || "暂无正文。";
  return [
    `# ${input.title}`,
    `- 来源：${input.sourceName ?? "未知"}`,
    `- 发布时间：${date}`,
    `- AIWatch 分数：${input.qualityScore ?? "未评分"}`,
    `- AIWatch 标记：${input.selectedLevel === "none" ? "未精选" : (input.selectedLabel ?? input.selectedLevel)}`,
    `- AIWatch 链接：${aiwatchUrl}`,
    `- 原文链接：${input.originalUrl ?? "暂无"}`,
    "## 精选理由",
    input.recommendationReason?.trim() || "暂无精选理由。",
    "## AI 摘要",
    input.summary?.trim() || "暂无摘要。",
    "## 正文",
    body,
  ];
}

function buildMarkdown(input: MarkdownExportButtonProps, format: ExportFormat = "markdown"): string {
  if (format === "json") return `${JSON.stringify({ ...metadata(input), summary: input.summary, recommendation_reason: input.recommendationReason }, null, 2)}\n`;
  if (format === "obsidian") return `${frontmatter(input)}\n\n## AIWatch Capture\n\n${bodySections(input).join("\n\n")}\n`;
  return `${bodySections(input).join("\n\n")}\n`;
}

function renderTemplate(input: MarkdownExportButtonProps, template: string): string {
  const meta = metadata(input);
  const values: Record<string, string> = {
    frontmatter: frontmatter(input),
    title: input.title,
    date: String(meta.date ?? ""),
    source: String(meta.source ?? ""),
    category: String(meta.category ?? ""),
    tags: (meta.tags as string[]).join(", "),
    score: meta.score === null || meta.score === undefined ? "" : String(meta.score),
    selected_level: String(meta.selected_level ?? ""),
    selected_label: String(meta.selected_label ?? ""),
    source_url: String(meta.source_url ?? ""),
    original_url: String(meta.original_url ?? ""),
    aiwatch_url: String(meta.aiwatch_url ?? ""),
    summary: input.summary?.trim() || "",
    recommendation_reason: input.recommendationReason?.trim() || "",
    body: input.bodyText?.trim() || input.summary?.trim() || "",
  };
  return `${template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => values[key] ?? "")}\n`;
}

function fileInfo(format: ExportFormat): { ext: string; type: string; label: string } {
  if (format === "json") return { ext: "json", type: "application/json;charset=utf-8", label: "JSON" };
  if (format === "custom") return { ext: "md", type: "text/markdown;charset=utf-8", label: "自定义模板" };
  if (format === "obsidian") return { ext: "md", type: "text/markdown;charset=utf-8", label: "Obsidian" };
  return { ext: "md", type: "text/markdown;charset=utf-8", label: "Markdown" };
}

export function MarkdownExportButton(props: MarkdownExportButtonProps) {
  const [state, setState] = useState<"idle" | "exported" | "failed">("idle");
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [template, setTemplate] = useState(DEFAULT_CUSTOM_TEMPLATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (saved) setTemplate(saved);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function resetSoon() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), RESET_DELAY_MS);
  }

  function downloadFile() {
    try {
      const info = fileInfo(format);
      const content = format === "custom" ? renderTemplate(props, template) : buildMarkdown(props, format);
      const blob = new Blob([content], { type: info.type });
      const url = URL.createObjectURL(blob);
      const download = document.createElement("a");
      download.href = url;
      download.download = `${slugify(props.title)}.${info.ext}`;
      document.body.appendChild(download);
      download.click();
      document.body.removeChild(download);
      URL.revokeObjectURL(url);
      setState("exported");
    } catch {
      setState("failed");
    }
    resetSoon();
  }

  const info = fileInfo(format);
  const label = state === "exported" ? `已导出 ${info.label}` : state === "failed" ? "导出失败" : `导出 ${info.label}`;

  return (
    <span className="markdown-export-control">
      <select
        aria-label="导出格式"
        className="markdown-export-select"
        value={format}
        onChange={(event) => setFormat(event.target.value as ExportFormat)}
        title="选择导出到知识库或脚本处理的文件格式"
      >
        <option value="obsidian">Obsidian</option>
        <option value="markdown">Markdown</option>
        <option value="json">JSON</option>
        <option value="custom">自定义</option>
      </select>
      {format === "custom" && (
        <textarea
          className="markdown-export-template"
          value={template}
          rows={5}
          spellCheck={false}
          aria-label="自定义 Markdown 模板"
          title="支持 {{title}}、{{summary}}、{{tags}}、{{frontmatter}} 等占位符"
          onChange={(event) => {
            setTemplate(event.target.value);
            window.localStorage.setItem(TEMPLATE_STORAGE_KEY, event.target.value);
          }}
        />
      )}
      <button
        type="button"
        className={`copy-link-btn markdown-export-btn ${state === "exported" ? "is-copied" : ""}`}
        onClick={downloadFile}
        aria-live="polite"
        title="下载当前资讯及 AIWatch 元数据"
      >
        {label}
      </button>
    </span>
  );
}

export { buildMarkdown };
