import { describe, expect, test } from "bun:test";
import { composeScoresV2 } from "./compose-v2";
import { scoringV2Config } from "./config";

const baseDims = {
  aiRelevance: 80,
  impact: 60,
  novelty: 50,
  audienceUsefulness: 70,
  evidenceClarity: 90,
};

describe("composeScoresV2", () => {
  test("golden: end-to-end layered score for a single-source L3 product release", () => {
    const r = composeScoresV2({
      zeroGatePassed: true,
      dimensions: baseDims,
      sourceLevel: "L3",
      sourcePostCount: 1,
      expertActions: [],
      validComments: [],
      contentType: "howto",
    });

    expect(r.relevancePassed).toBe(true);
    expect(r.qualityScore).toBeCloseTo(67, 6);
    // confidence: evid 90*.35 + L3 70*.25 + multiSource 0 + expertNeutral 50*.15 = 56.5
    expect(r.confidenceScore).toBeCloseTo(56.5, 6);
    // gated = 67*(0.5+0.5*0.565)=52.4275; neutral comment/citation add 0; howto ×1.05
    expect(r.selectionScore).toBeCloseTo(55.048875, 4);
    expect(r.maxLevel).toBe("S");
  });

  test("failing the relevance gate forces selection_score to 0 and selected=false", () => {
    const r = composeScoresV2({
      zeroGatePassed: true,
      dimensions: { ...baseDims, aiRelevance: 30 },
      sourceLevel: "L1",
      sourcePostCount: 5,
      expertActions: [],
      validComments: [],
      contentType: "release",
    });
    expect(r.relevancePassed).toBe(false);
    expect(r.selectionScore).toBe(0);
    // quality/confidence still computed for explainability
    expect(r.qualityScore).toBeGreaterThan(0);
    expect(r.confidenceScore).toBeGreaterThan(0);
  });

  test("multi-source corroboration raises confidence and thus selection", () => {
    const common = {
      zeroGatePassed: true,
      dimensions: baseDims,
      sourceLevel: "L3" as const,
      expertActions: [],
      validComments: [],
      contentType: "howto" as const,
    };
    const single = composeScoresV2({ ...common, sourcePostCount: 1 });
    const corroborated = composeScoresV2({ ...common, sourcePostCount: 4 });
    expect(corroborated.confidenceScore).toBeGreaterThan(single.confidenceScore);
    expect(corroborated.selectionScore).toBeGreaterThan(single.selectionScore);
  });

  test("passes text+media signal into selection scoring", () => {
    const common = {
      zeroGatePassed: true,
      dimensions: baseDims,
      sourceLevel: "L3" as const,
      sourcePostCount: 1,
      expertActions: [],
      validComments: [],
      contentType: "news" as const,
    };
    const base = composeScoresV2({ ...common, hasTextAndMedia: false });
    const rich = composeScoresV2({ ...common, hasTextAndMedia: true });

    expect(rich.selectionScore).toBeGreaterThan(base.selectionScore);
    expect(rich.breakdown.selection.mediaTextBonus).toBe(3);
  });

  test("breakdown carries every layer and the v2 version stamp", () => {
    const r = composeScoresV2({
      zeroGatePassed: true,
      dimensions: baseDims,
      sourceLevel: "L2",
      sourcePostCount: 2,
      expertActions: [],
      validComments: [],
      contentType: "howto",
    });
    expect(r.breakdown.configVersion).toBe(scoringV2Config.version);
    expect(r.breakdown.relevance).toBeDefined();
    expect(r.breakdown.quality).toBeDefined();
    expect(r.breakdown.confidence).toBeDefined();
    expect(r.breakdown.selection).toBeDefined();
    expect(r.breakdown.expertValue).toBeDefined();
  });
});
