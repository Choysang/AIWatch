// Pipeline judgment contracts. The LLM produces a light routing-neutral judgment first;
// code derives T0/T1/T2. Only T2 items receive the deep extraction schema.

import type { RawPost } from "@/connectors/types";
import { z } from "zod";

const dimension = z.number().int().min(0).max(100);

// --- Reader taxonomy. Each event gets one public category (drives the reader filter and
// events.category) plus supplementary free-form tags from deep extraction. content_type remains
// an internal compatibility/folding field while old rows and scoring code still use it. ---

// Public category axis (4). Persisted on events.category / event_judgments.category.
export const INTELLIGENCE_DOMAINS = [
  "product",
  "technology",
  "tips",
  "discussion",
] as const;
// The light judge may also emit "trash" (out of AI-Dev scope); it never reaches an event.
export const LIGHT_DOMAINS = [...INTELLIGENCE_DOMAINS, "trash"] as const;
export type IntelligenceDomain = (typeof INTELLIGENCE_DOMAINS)[number];
export type LightDomain = (typeof LIGHT_DOMAINS)[number];

const LEGACY_DOMAIN_ALIASES: Record<string, LightDomain> = {
  large_model: "product",
  product_app: "product",
  framework_tools: "technology",
  research_paper: "technology",
  safety_align: "technology",
  industry_biz: "discussion",
  Core_Research: "technology",
  Dev_Stack: "technology",
  Product_Business: "product",
  Practical_Build: "tips",
};

const LEGACY_DOMAIN_VALUES = [
  "large_model",
  "product_app",
  "framework_tools",
  "research_paper",
  "safety_align",
  "industry_biz",
  "Core_Research",
  "Dev_Stack",
  "Product_Business",
  "Practical_Build",
] as const;

const domainSchema = z
  .union([z.enum(LIGHT_DOMAINS), z.enum(LEGACY_DOMAIN_VALUES)])
  .transform((value): LightDomain => (LEGACY_DOMAIN_ALIASES[value] ?? value) as LightDomain);

export const EVENT_TIERS = ["T1", "T2"] as const;
export type EventTier = (typeof EVENT_TIERS)[number];

// Internal content-type axis. Produced by triage for folding/scoring compatibility, but no
// longer shown as a separate reader filter.
export const CONTENT_TYPES = [
  "release", // 发布：模型/产品/功能/API 上线
  "research", // 研究：论文、方法、结论
  "howto", // 教程实操：可照做的步骤、工程实践
  "opinion", // 观点讨论：评论、判断、争议
  "news", // 行业动态：融资/收购/政策/生态
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

const LEGACY_CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
  model_release: "release",
  product_release: "release",
  tech_share: "howto",
  discussion: "opinion",
};

const LEGACY_CONTENT_TYPE_VALUES = [
  "model_release",
  "product_release",
  "tech_share",
  "discussion",
] as const;

const contentTypeSchema = z
  .union([z.enum(CONTENT_TYPES), z.enum(LEGACY_CONTENT_TYPE_VALUES)])
  .transform((value): ContentType => (LEGACY_CONTENT_TYPE_ALIASES[value] ?? value) as ContentType);

export interface LightJudge {
  domain: LightDomain;
  score: number;
  ai_relevance: number;
  impact: number;
  novelty: number;
  audience_usefulness: number;
  evidence_clarity: number;
  content_type: ContentType;
  one_line_summary: string;
  fold: {
    primary_entity: string;
  };
}

const lightJudgeObjectSchema = z.object({
  domain: domainSchema,
  score: dimension,
  ai_relevance: dimension,
  impact: dimension,
  novelty: dimension,
  audience_usefulness: dimension,
  evidence_clarity: dimension,
  content_type: contentTypeSchema,
  one_line_summary: z.string().min(1),
  fold: z.object({
    primary_entity: z.string().min(1),
  }),
});
export const lightJudgeSchema = lightJudgeObjectSchema as z.ZodType<LightJudge, z.ZodTypeDef, unknown>;

export const deepExtractSchema = z.object({
  detailed_summary: z.string().min(1),
  core_viewpoints: z.array(z.string().min(1)).max(3),
  tools: z.array(z.string().min(1)).default([]),
  people: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).max(8).default([]),
});
export type DeepExtract = z.infer<typeof deepExtractSchema>;

export interface FoldFields {
  primaryEntity: string;
  foldKey: string;
  simhash: string;
}

export interface ColdJudge {
  aiScore: number;
  aiScoreReason: string;
  tier: EventTier;
  oneSentenceSummary: string;
  detailedSummary: string | null;
  coreViewpoints: string[];
  tools: string[];
  people: string[];
  aiRelevance: number;
  impact: number;
  novelty: number;
  audienceUsefulness: number;
  evidenceClarity: number;
  title: string;
  summary: string;
  category: IntelligenceDomain;
  contentType: ContentType;
  tags: string[];
  recommendationReason: string;
  fold: FoldFields;
  rawLight: LightJudge;
  rawDeep: DeepExtract | null;
}

export function gateLightJudge(light: LightJudge): EventTier {
  if (light.domain === "trash") return "T1";
  return light.score >= 80 ? "T2" : "T1";
}

/** Share of CJK characters below which a raw title reads as "foreign" to the zh reader. */
const TITLE_CJK_MIN_RATIO = 0.15;

function cjkRatio(text: string): number {
  const chars = [...text].filter((c) => !/\s/.test(c));
  if (chars.length === 0) return 0;
  const cjk = chars.filter((c) => /[一-鿿㐀-䶿]/.test(c)).length;
  return cjk / chars.length;
}

// Chinese-first cards (2026-06-12): tweets/posts arrive with English raw titles, but the
// reader is zh-only — so when the raw title is essentially CJK-free and the judge produced
// a Chinese one-line summary, the summary becomes the display title. The original text
// stays reachable via the detail page's 原文 section.
export function deriveTitle(raw: RawPost, oneLineSummary: string): string {
  const title = raw.rawTitle?.trim();
  const summaryTitle = oneLineSummary.replace(/[。.!！?？]\s*$/, "").slice(0, 200);
  if (title && (cjkRatio(title) >= TITLE_CJK_MIN_RATIO || !summaryTitle)) {
    return title.slice(0, 200);
  }
  return summaryTitle || (title ?? "").slice(0, 200);
}

export function normalizeFoldEntity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5._-]+/g, "-")
    .replace(/\.+$/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const FOLD_ENTITY_ALIASES: Record<string, string> = {
  "chat.openai.com": "openai",
  chatgpt: "openai",
  "gpt-4": "openai",
  "gpt-4o": "openai",
  sora: "openai",
  "claude-code": "anthropic",
  claude: "anthropic",
  "gemini": "google",
  "gemini-code-assist": "google",
};

function canonicalFoldEntity(value: string): string {
  return FOLD_ENTITY_ALIASES[value] ?? value;
}

// Fold discriminator is now the content_type axis (dual-axis design §2.2): the same entity
// doing the same kind of thing (e.g. openai|release) folds into one event.
export function buildFoldKey(primaryEntity: string, contentType: ContentType): string {
  const entity = canonicalFoldEntity(normalizeFoldEntity(primaryEntity));
  return `${entity || "unknown"}|${contentType}`;
}

export function formatSummary(judgment: {
  tier: EventTier;
  oneSentenceSummary: string;
  detailedSummary: string | null;
  coreViewpoints: string[];
}): string {
  if (judgment.tier === "T1") return judgment.oneSentenceSummary;
  const points = judgment.coreViewpoints
    .slice(0, 3)
    .map((point, index) => `${index + 1}. ${point}`)
    .join("\n");
  return [
    judgment.detailedSummary ?? judgment.oneSentenceSummary,
    points ? `核心观点：\n${points}` : "",
  ].filter(Boolean).join("\n");
}
