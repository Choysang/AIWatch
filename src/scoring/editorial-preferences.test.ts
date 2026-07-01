import { describe, expect, test } from "bun:test";
import { applyEditorialPreference } from "./editorial-preferences";

describe("applyEditorialPreference", () => {
  test("direct owner annotations dominate promotion scoring", () => {
    expect(
      applyEditorialPreference({
        selectionScore: 82,
        ownerBoost: -45,
        title: "OpenAI customer case study with a regional bank",
        summary: "A bank says it will cooperate with an AI vendor.",
        contentType: "news",
        sourceType: "official",
      }).score,
    ).toBeLessThan(45);

    expect(
      applyEditorialPreference({
        selectionScore: 72,
        ownerBoost: 18,
        title: "A practical eval harness for agent regressions",
        summary: "The post includes reproducible code and failure cases.",
        contentType: "howto",
        sourceType: "expert",
      }).score,
    ).toBeGreaterThan(80);
  });

  test("penalizes PR partnerships and bottom-layer papers while keeping legal/regulatory news", () => {
    const pr = applyEditorialPreference({
      selectionScore: 86,
      ownerBoost: 0,
      title: "某银行与某 AI 公司达成合作",
      summary: "企业客户案例与联合营销，没有新的产品或技术细节。",
      contentType: "news",
      sourceType: "official",
    });
    expect(pr.score).toBeLessThan(70);
    expect(pr.reasons).toContain("pr_marketing");

    const paper = applyEditorialPreference({
      selectionScore: 84,
      ownerBoost: 0,
      title: "A note on batch-size schedules for pretraining",
      summary: "The paper studies optimizer details without usable result or conceptual shift.",
      contentType: "research",
      sourceType: "expert",
    });
    expect(paper.score).toBeLessThan(72);
    expect(paper.reasons).toContain("bottom_layer_paper");

    const lawsuit = applyEditorialPreference({
      selectionScore: 76,
      ownerBoost: 0,
      title: "AI startup faces copyright lawsuit from publishers",
      summary: "The case could affect model training data and industry regulation.",
      contentType: "news",
      sourceType: "media",
    });
    expect(lawsuit.score).toBeGreaterThan(86);
    expect(lawsuit.reasons).toContain("legal_regulatory");
  });

  test("drops pure car-product noise but keeps self-developed AI/autonomous-driving breakthroughs", () => {
    const car = applyEditorialPreference({
      selectionScore: 74,
      ownerBoost: 0,
      title: "新款 SUV 上市，续航和座舱升级",
      summary: "主要介绍车型价格、内饰、续航与交付时间。",
      contentType: "news",
      sourceType: "media",
    });
    expect(car.score).toBeLessThan(45);
    expect(car.reasons).toContain("pure_auto_noise");

    const aiCar = applyEditorialPreference({
      selectionScore: 74,
      ownerBoost: 0,
      title: "车厂发布端到端自动驾驶模型",
      summary: "自研多模态模型改善城区 NOA，披露训练数据和评测结果。",
      contentType: "release",
      sourceType: "official",
    });
    expect(aiCar.score).toBeGreaterThanOrEqual(74);
    expect(aiCar.reasons).not.toContain("pure_auto_noise");
  });

  test("penalizes personal self-promotion but keeps practical technical insight from builders", () => {
    const promo = applyEditorialPreference({
      selectionScore: 78,
      ownerBoost: 0,
      title: "I launched my new AI course and newsletter",
      summary: "Subscribe today for a limited discount and consulting slots.",
      contentType: "news",
      sourceType: "expert",
    });
    expect(promo.score).toBeLessThan(60);
    expect(promo.reasons).toContain("personal_self_promo");

    const insight = applyEditorialPreference({
      selectionScore: 72,
      ownerBoost: 0,
      title: "A practical guide to writing reliable Agent workflows",
      summary: "Includes prompt patterns, implementation notes, debug cases, and repo examples.",
      contentType: "howto",
      sourceType: "expert",
    });
    expect(insight.score).toBeGreaterThan(76);
    expect(insight.reasons).toContain("personal_technical_insight");
    expect(insight.reasons).not.toContain("personal_self_promo");
  });
});
