import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

type CuratedSource = {
  name: string;
  ai_density_score: number;
  category: string;
  connectorType: string;
  connectorRef: string;
};

const root = process.cwd();
const curated = JSON.parse(
  readFileSync(join(root, "data", "sources", "curated_ai_sources.json"), "utf8"),
) as CuratedSource[];
const audit = readFileSync(join(root, "data", "sources", "source_audit_report.csv"), "utf8");
const glossary = readFileSync(join(root, "data", "glossary", "ai_terms_zh.json"), "utf8");
const prompts = readFileSync(join(root, "src", "pipeline", "prompts.ts"), "utf8");

describe("curated AI source policy", () => {
  test("keeps only scored AI-dense sources in the curated config", () => {
    expect(curated.length).toBeGreaterThanOrEqual(100);
    for (const source of curated) {
      expect(source.ai_density_score).toBeGreaterThanOrEqual(6);
      expect(["official", "industry_leader", "technical_share"]).toContain(source.category);
      expect(source.connectorRef).toBeTruthy();
    }
  });

  test("does not define duplicate connector refs", () => {
    const refs = curated.map((source) => source.connectorRef.toLowerCase());
    expect(new Set(refs).size).toBe(refs.length);
  });

  test("does not keep explicitly excluded generic technology or business sources", () => {
    const names = curated.map((source) => source.name);
    expect(names).not.toContain("腾讯技术工程");
    expect(names).not.toContain("美团技术团队");
    expect(names).not.toContain("阮一峰的网络日志");
    expect(names).not.toContain("刘润");
    expect(names).not.toContain("吴晓波频道");
    expect(names).not.toContain("Simon Willison");
    expect(names).not.toContain("Hugging Face Blog");
    expect(names).not.toContain("Cloudflare Blog");
  });

  test("records explicit exclusion reasons in the source audit report", () => {
    expect(audit).toContain("exclusion_reason");
    expect(audit).toContain("腾讯技术工程");
    expect(audit).toContain("generic_big_factory_engineering");
    expect(audit).toContain("阮一峰的网络日志");
    expect(audit).toContain("generic_tech_noise");
    expect(audit).toContain("刘润");
    expect(audit).toContain("business_finance_noise");
  });

  test("ships a Chinese AI glossary for summary consistency", () => {
    expect(glossary).toContain('"Agent": "智能体"');
    expect(glossary).toContain('"Workflow": "工作流"');
    expect(glossary).toContain('"Open-weight Model": "开放权重模型"');
  });

  test("keeps glossary and reflection constraints in the deep extraction prompt", () => {
    expect(prompts).toContain("Agent=智能体");
    expect(prompts).toContain("Workflow=工作流");
    expect(prompts).toContain("反思检查");
    expect(prompts).toContain("是否标题党/营销软文");
  });
});
