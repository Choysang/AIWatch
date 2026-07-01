import { describe, expect, test } from "bun:test";
import { OPENAPI_YAML } from "./openapi";
import { SKILL_MD } from "./skill-md";

describe("public API and Skill contract", () => {
  test("documents hotspots, stable sort timestamps, and report permalinks", () => {
    expect(OPENAPI_YAML).toContain("/api/public/hotspots");
    expect(OPENAPI_YAML).toContain("PublicHotspotsResponse");
    expect(OPENAPI_YAML).toContain("created_at:");
    expect(OPENAPI_YAML).toContain("sort_at:");
    expect(OPENAPI_YAML).toContain("PublicReportListItem");
    expect(OPENAPI_YAML).toContain("permalink:");
  });

  test("teaches agents hotspot routing and one-time version self-check", () => {
    expect(SKILL_MD).toContain("version: 2026.07.01");
    expect(SKILL_MD).toContain("GET /api/public/hotspots");
    expect(SKILL_MD).toContain("sections[].items[]");
    expect(SKILL_MD).toContain("版本自检");
  });
});
