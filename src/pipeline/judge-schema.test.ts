import { describe, expect, test } from "bun:test";
import { DEFAULT_JUDGMENT } from "@/llm/stub";
import {
  buildFoldKey,
  deepExtractSchema,
  deriveTitle,
  gateLightJudge,
  lightJudgeSchema,
} from "./judge-schema";

describe("pipeline judgment contracts", () => {
  test("light schema accepts the stub fixture (public category + internal content_type)", () => {
    const parsed = lightJudgeSchema.parse(DEFAULT_JUDGMENT);
    expect(parsed.domain).toBe("technology");
    expect(parsed.content_type).toBe("release");
    expect(parsed.score).toBe(82);
  });

  test("light schema requires independent score dimensions", () => {
    const parsed = lightJudgeSchema.parse(DEFAULT_JUDGMENT);
    expect(parsed.ai_relevance).toBe(80);
    expect(parsed.impact).toBe(72);
    expect(parsed.novelty).toBe(68);
    expect(parsed.audience_usefulness).toBe(76);
    expect(parsed.evidence_clarity).toBe(84);
    expect(new Set([
      parsed.ai_relevance,
      parsed.impact,
      parsed.novelty,
      parsed.audience_usefulness,
      parsed.evidence_clarity,
    ])).not.toEqual(new Set([parsed.score]));
  });

  test("light schema rejects score-only payloads that cannot feed weighted scoring", () => {
    const { ai_relevance, impact, novelty, audience_usefulness, evidence_clarity, ...scoreOnly } =
      DEFAULT_JUDGMENT;
    expect(lightJudgeSchema.safeParse(scoreOnly).success).toBe(false);
  });

  test("light schema normalizes legacy category and content-type values", () => {
    const parsed = lightJudgeSchema.parse({
      ...DEFAULT_JUDGMENT,
      domain: "large_model",
      content_type: "tech_share",
    });
    expect(parsed.domain).toBe("product");
    expect(parsed.content_type).toBe("howto");
  });

  test("deep schema accepts the stub fixture and has no gold_quote contract", () => {
    const parsed = deepExtractSchema.parse(DEFAULT_JUDGMENT);
    expect(parsed.core_viewpoints.length).toBeGreaterThanOrEqual(2);
    expect("gold_quote" in parsed).toBe(false);
  });

  test("deep schema allows sparse core viewpoints instead of forcing unsupported padding", () => {
    const parsed = deepExtractSchema.parse({
      detailed_summary: "原文只说明项目发布，缺少足够技术细节。",
      core_viewpoints: ["原文明确提到该项目已发布，但没有披露性能数据。"],
      tools: [],
      people: [],
      tags: ["release"],
    });

    expect(parsed.core_viewpoints).toHaveLength(1);
  });

  test("code derives tier without dropping trusted-source posts", () => {
    const base = lightJudgeSchema.parse(DEFAULT_JUDGMENT);
    expect(gateLightJudge({ ...base, score: 59 })).toBe("T1");
    expect(gateLightJudge({ ...base, domain: "trash", score: 95 })).toBe("T1");
    expect(gateLightJudge({ ...base, score: 79 })).toBe("T1");
    expect(gateLightJudge({ ...base, score: 80 })).toBe("T2");
  });

  test("fold key normalizes entity and uses the content_type axis", () => {
    expect(buildFoldKey("@OpenAI Inc.", "release")).toBe("openai-inc|release");
    expect(buildFoldKey("PyTorch", "research")).toBe("pytorch|research");
  });

  test("fold key canonicalizes known product aliases to the owning entity", () => {
    expect(buildFoldKey("ChatGPT", "release")).toBe("openai|release");
    expect(buildFoldKey("chat.openai.com", "release")).toBe("openai|release");
    expect(buildFoldKey("Claude Code", "release")).toBe("anthropic|release");
  });

  test("deriveTitle keeps a Chinese raw title as-is", () => {
    const title = deriveTitle(
      { rawTitle: "OpenAI 发布 GPT-5 全量上线" },
      "OpenAI 发布了 GPT-5，带来推理能力提升。",
    );
    expect(title).toBe("OpenAI 发布 GPT-5 全量上线");
  });

  test("deriveTitle prefers the Chinese summary over an all-English raw title", () => {
    const title = deriveTitle(
      { rawTitle: "Introducing GPT-5: our most capable model yet, rolling out today" },
      "OpenAI 发布了 GPT-5，带来推理能力提升。",
    );
    expect(title).toBe("OpenAI 发布了 GPT-5，带来推理能力提升");
  });

  test("deriveTitle falls back to the English raw title when the summary is empty", () => {
    const title = deriveTitle(
      { rawTitle: "Introducing GPT-5: our most capable model yet" },
      "",
    );
    expect(title).toBe("Introducing GPT-5: our most capable model yet");
  });

  test("deriveTitle falls back to the summary without a raw title", () => {
    const title = deriveTitle({}, "Anthropic 发布了 Claude 新版本。");
    expect(title).toBe("Anthropic 发布了 Claude 新版本");
  });
});
