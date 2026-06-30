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
}

const RESET_DELAY_MS = 2000;

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

function buildMarkdown(input: MarkdownExportButtonProps): string {
  const tags = input.tags.filter(Boolean);
  const date = input.publishedAt ?? input.promotedAt;
  const frontmatter = [
    "---",
    `title: ${yamlString(input.title)}`,
    `date: ${yamlString(date)}`,
    `source: ${yamlString(input.sourceName)}`,
    `category: ${yamlString(input.category)}`,
    `tags: ${markdownList(tags)}`,
    `score: ${input.qualityScore ?? "null"}`,
    `selected: ${input.selectedLevel !== "none"}`,
    `selected_level: ${yamlString(input.selectedLevel)}`,
    `selected_label: ${yamlString(input.selectedLabel)}`,
    `source_url: ${yamlString(input.sourceUrl)}`,
    `original_url: ${yamlString(input.originalUrl)}`,
    `aiwatch_url: ${yamlString(buildAiWatchUrl(input.aiwatchPath))}`,
    "---",
  ].join("\n");

  const sections = [
    `# ${input.title}`,
    "## 摘要",
    input.summary?.trim() || "暂无摘要。",
    "## 精选理由",
    input.recommendationReason?.trim() || "暂无精选理由。",
    "## 原文链接",
    input.originalUrl ? `- [打开原文](${input.originalUrl})` : "- 暂无原文链接",
    input.sourceUrl ? `- [信源主页](${input.sourceUrl})` : "- 暂无信源主页链接",
    `- [AIWatch 详情](${buildAiWatchUrl(input.aiwatchPath)})`,
  ];

  return `${frontmatter}\n\n${sections.join("\n\n")}\n`;
}

export function MarkdownExportButton(props: MarkdownExportButtonProps) {
  const [state, setState] = useState<"idle" | "exported" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function resetSoon() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), RESET_DELAY_MS);
  }

  function downloadMarkdown() {
    try {
      const markdown = buildMarkdown(props);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const download = document.createElement("a");
      const { title } = props;
      download.href = url;
      download.download = `${slugify(title)}.md`;
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

  const label =
    state === "exported" ? "已导出 Markdown" : state === "failed" ? "导出失败" : "导出为 Markdown";

  return (
    <button
      type="button"
      className={`copy-link-btn markdown-export-btn ${state === "exported" ? "is-copied" : ""}`}
      onClick={downloadMarkdown}
      aria-live="polite"
    >
      {label}
    </button>
  );
}

export { buildMarkdown };
