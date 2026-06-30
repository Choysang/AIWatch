import type { SourceTypeValue } from "@/db/queries/sources";
import type { SourceLevel } from "@/scoring/types";

export const AI_SOURCE_CATEGORIES = [
  "official",
  "industry_leader",
  "technical_share",
  "media",
  "community",
  "open_source",
] as const;

export type AiSourceCategory = (typeof AI_SOURCE_CATEGORIES)[number];

export const AI_SOURCE_CATEGORY_LABEL: Record<AiSourceCategory, string> = {
  official: "官方",
  industry_leader: "行业领袖",
  technical_share: "技术分享",
  media: "媒体",
  community: "社区",
  open_source: "开源项目",
};

export const AI_SOURCE_CATEGORY_SHORT_LABEL: Record<AiSourceCategory, string> = {
  official: "官方",
  industry_leader: "行业领袖",
  technical_share: "技术分享",
  media: "媒体",
  community: "社区",
  open_source: "开源",
};

export const AI_SOURCE_CATEGORY_DESCRIPTION: Record<AiSourceCategory, string> = {
  official: "官方账号、官网、产品公告与一手发布源",
  industry_leader: "创始人、研究/产品/工程负责人、行业关键人物",
  technical_share: "开发工具、教程实践、研究者与高质量技术分享",
  media: "媒体、Newsletter、资讯聚合与高信噪比行业报道",
  community: "社区讨论、实践反馈、用户案例复盘与一线观察",
  open_source: "开源项目、模型仓库、框架与工程基础设施",
};

export const AI_SOURCE_CATEGORY_META: Record<
  AiSourceCategory,
  { sourceType: SourceTypeValue; level: SourceLevel }
> = {
  official: { sourceType: "official", level: "L1" },
  industry_leader: { sourceType: "employee", level: "L2" },
  technical_share: { sourceType: "expert", level: "L3" },
  media: { sourceType: "media", level: "L4" },
  community: { sourceType: "community", level: "L3" },
  open_source: { sourceType: "open_source_project", level: "L3" },
};

const CATEGORY_SET: ReadonlySet<string> = new Set(AI_SOURCE_CATEGORIES);

const CATEGORY_ALIASES: Record<string, AiSourceCategory> = {
  ai_lab_vendor: "official",
  vertical_ai_product: "official",
  official_first_party: "official",
  官方: "official",
  官方渠道: "official",
  官方账号: "official",
  实验室: "official",
  "ai 实验室": "official",
  大厂: "official",
  产品官方: "official",

  ai_leader_pioneer: "industry_leader",
  startup_investment: "industry_leader",
  core_people: "industry_leader",
  individual_builder: "industry_leader",
  founder: "industry_leader",
  expert: "industry_leader",
  专家: "industry_leader",
  核心人物: "industry_leader",
  行业领袖: "industry_leader",
  员工: "industry_leader",
  创始人: "industry_leader",
  创投: "industry_leader",
  创业者: "industry_leader",

  devtool_infra: "technical_share",
  research_hacker: "technical_share",
  global_media_aggregator: "media",
  community_practice: "community",
  media_info: "media",
  technical_supplement: "technical_share",
  platform: "technical_share",
  开发工具: "technical_share",
  基础设施: "technical_share",
  开源项目: "open_source",
  产品: "official",
  垂直产品: "official",
  研究员: "technical_share",
  极客: "technical_share",
  技术实践: "technical_share",
  技术分享: "technical_share",
  媒体: "media",
  资讯: "media",
  聚合: "media",
  社区: "community",
  开源: "open_source",
};

export function isAiSourceCategory(value: string): value is AiSourceCategory {
  return CATEGORY_SET.has(value);
}

export function normalizeAiSourceCategory(value: string): AiSourceCategory | null {
  const v = value.trim();
  if (!v) return null;
  if (isAiSourceCategory(v)) return v;
  const lower = v.toLowerCase();
  if (isAiSourceCategory(lower)) return lower;
  return CATEGORY_ALIASES[lower] ?? CATEGORY_ALIASES[v] ?? null;
}

export function normalizeAiSourceCategories(values: readonly string[]): AiSourceCategory[] {
  const seen = new Set<AiSourceCategory>();
  for (const value of values) {
    const category = normalizeAiSourceCategory(value);
    if (category) seen.add(category);
  }
  return AI_SOURCE_CATEGORIES.filter((category) => seen.has(category));
}

export function parseAiSourceCategories(raw: string | null | undefined): AiSourceCategory[] | undefined {
  if (!raw) return undefined;
  const parsed = normalizeAiSourceCategories(raw.split(","));
  return parsed.length ? parsed : undefined;
}

export function sourceCategoryLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  const normalized = normalizeAiSourceCategory(category);
  return normalized ? AI_SOURCE_CATEGORY_LABEL[normalized] : null;
}

export function inferAiSourceCategory(input: {
  sourceProfile?: string;
  sourceType?: string;
  level?: string;
  platform?: string;
  name?: string;
  handle?: string | null;
  url?: string | null;
}): AiSourceCategory {
  const profile = normalizeAiSourceCategory(input.sourceProfile ?? "");
  if (profile) return profile;

  const text = `${input.name ?? ""} ${input.handle ?? ""} ${input.url ?? ""}`.toLowerCase();
  if (/\b(openai|anthropic|deepmind|googleai|google ai|gemini|mistral|cohere|xai|meta ai|aiatmeta|qwen|deepseek|moonshot|minimax|zhipu|nvidia ai|microsoft ai|msftresearch|hunyuan)\b/.test(text)) {
    return "official";
  }
  if (/\b(langchain|llamaindex|github|huggingface|replicate|vercel|cursor|windsurf|wandb|weaviate|pinecone|aisdk|sdk|replit|openrouter|ollama|cline|continue)\b/.test(text)) {
    return "technical_share";
  }
  if (/\b(runway|midjourney|elevenlabs|heygen|suno|udio|gamma|lovable|perplexity|notion|canva)\b/.test(text)) {
    return "official";
  }
  if (/\b(sama|sam altman|karpathy|dario|ilya|lecun|hassabis|andrew ng|a16z|sequoia|yc|ycombinator|startup|founder|builder|investor|vc)\b/.test(text)) {
    return "industry_leader";
  }
  if (/\b(news|daily|digest|rundown|decoder|ben's bites|bensbites|breakfast|newsletter|media|ai engineer|aidotengineer)\b/.test(text)) {
    return "media";
  }

  if (input.platform === "news") return "media";
  if (input.platform === "github" || input.platform === "huggingface") return "open_source";
  if (input.sourceType === "open_source_project") return "open_source";
  if (input.sourceType === "community") return "community";
  if (input.sourceType === "media") return "media";
  if (input.sourceType === "employee" || input.sourceType === "expert" || input.sourceType === "kol" || input.level === "L2") {
    return "industry_leader";
  }
  if (input.sourceType === "official" || input.level === "L1") return "official";
  if (input.level === "L4" || input.level === "L5") return "technical_share";
  return "technical_share";
}
