import { describe, expect, test } from "bun:test";
import { scoringV2Config } from "./config";
import { computeRelevanceGate } from "./relevance-gate";

describe("computeRelevanceGate", () => {
  test("passes when the $0 gate passed and aiRelevance meets the floor", () => {
    const r = computeRelevanceGate({ zeroGatePassed: true, aiRelevance: 50 });
    expect(r.passed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  test("fails closed when the $0 gate did not pass, regardless of aiRelevance", () => {
    const r = computeRelevanceGate({ zeroGatePassed: false, aiRelevance: 100 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("zero_gate");
  });

  test("fails when aiRelevance is strictly below the floor", () => {
    const r = computeRelevanceGate({ zeroGatePassed: true, aiRelevance: 49 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe("below_relevance_min");
  });

  test("boundary: exactly at the floor passes (>=)", () => {
    const r = computeRelevanceGate({
      zeroGatePassed: true,
      aiRelevance: scoringV2Config.relevanceMin,
    });
    expect(r.passed).toBe(true);
  });

  test("stamps the v2 config version and the floor used", () => {
    const r = computeRelevanceGate({ zeroGatePassed: true, aiRelevance: 80 });
    expect(r.configVersion).toBe(scoringV2Config.version);
    expect(r.relevanceMin).toBe(scoringV2Config.relevanceMin);
  });
});
