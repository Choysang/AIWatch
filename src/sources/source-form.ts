import { z } from "zod";
import type { ConnectorType } from "@/connectors/types";
import type { Platform, SourceLevel } from "@/scoring/types";
import type { SourceTypeValue } from "@/db/queries/sources";
import { deriveConnector } from "./source-ref";

export const PLATFORMS = [
  "x", "github", "reddit", "hackernews", "blog", "zhihu", "csdn",
  "rss", "news", "youtube", "bilibili", "huggingface", "weibo",
] as const;

export const SOURCE_PROFILES = [
  "official_first_party",
  "core_people",
  "community_practice",
  "media_info",
  "technical_supplement",
] as const;

export const SOURCE_PROFILE_LABEL: Record<(typeof SOURCE_PROFILES)[number], string> = {
  official_first_party: "一手官方（官网、官方账号）",
  core_people: "核心人物（创始人、研究/产品/工程负责人）",
  community_practice: "社区实践（开发者、社区讨论、开源项目）",
  media_info: "媒体资讯（媒体、行业报道）",
  technical_supplement: "技术补充（教程、经验、长尾博客）",
};

export const PLATFORM_LABEL: Record<(typeof PLATFORMS)[number], string> = {
  x: "X / Twitter",
  github: "GitHub",
  reddit: "Reddit",
  hackernews: "Hacker News",
  blog: "博客",
  zhihu: "知乎",
  csdn: "CSDN",
  rss: "RSS",
  news: "新闻站",
  youtube: "YouTube",
  bilibili: "哔哩哔哩",
  huggingface: "Hugging Face",
  weibo: "微博",
};

const blankToUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const sourceProfileSchema = z.enum(SOURCE_PROFILES);
export const sourceTypeSchema = z.enum([
  "official", "employee", "expert", "kol", "media", "community", "open_source_project",
]);
export const sourceLevelSchema = z.enum(["L1", "L2", "L3", "L4", "L5"]);

export const sourceFormSchema = z.object({
  name: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(200)),
  platform: z.enum(PLATFORMS),
  sourceProfile: sourceProfileSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  level: sourceLevelSchema.optional(),
  connectorType: z.enum([
    "rss", "github", "hn", "youtube_rss", "huggingface", "reddit", "rsshub", "mock", "manual",
  ]).optional(),
  handle: optionalText(120),
  url: z.preprocess(blankToUndefined, z.string().trim().url().optional()),
  connectorRef: optionalText(500),
  categories: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  recommendedBy: optionalText(120),
  recommendReason: optionalText(1000),
});

export type SourceFormInput = z.infer<typeof sourceFormSchema>;

export function sourceMetaFromProfile(input: {
  sourceProfile?: SourceFormInput["sourceProfile"];
  sourceType?: SourceTypeValue;
  level?: SourceLevel;
}): { sourceType: SourceTypeValue; level: SourceLevel } {
  switch (input.sourceProfile) {
    case "official_first_party":
      return { sourceType: "official", level: "L1" };
    case "core_people":
      return { sourceType: "employee", level: "L2" };
    case "community_practice":
      return { sourceType: "community", level: "L3" };
    case "media_info":
      return { sourceType: "media", level: "L4" };
    case "technical_supplement":
      return { sourceType: "expert", level: "L5" };
    default:
      return {
        sourceType: input.sourceType ?? "community",
        level: input.level ?? "L3",
      };
  }
}

export function parseCategories(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function toCreateSourceInput(input: SourceFormInput): {
  name: string;
  platform: Platform;
  sourceType: SourceTypeValue;
  level: SourceLevel;
  connectorType: ConnectorType;
  handle: string | null;
  url: string | null;
  connectorRef: string | null;
  categories: string[];
  brandTag: null;
  recommendedBy: string | null;
  recommendReason: string | null;
} {
  const connector = deriveConnector({
    platform: input.platform,
    connectorType: input.connectorType,
    url: input.url,
    handle: input.handle,
    connectorRef: input.connectorRef,
  });
  const sourceMeta = sourceMetaFromProfile(input);
  return {
    name: input.name,
    platform: input.platform,
    sourceType: sourceMeta.sourceType,
    level: sourceMeta.level,
    connectorType: connector.connectorType,
    handle: input.handle ?? null,
    url: input.url ?? null,
    connectorRef: connector.connectorRef,
    categories: parseCategories(input.categories),
    brandTag: null,
    recommendedBy: input.recommendedBy ?? null,
    recommendReason: input.recommendReason ?? null,
  };
}
