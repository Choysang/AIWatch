import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "recompute-rank-scores.ts"), "utf8");

describe("recomputeRankScores source parity", () => {
  test("bulk SQL includes the same source x content-type owner affinity dimension as the pure scorer", () => {
    expect(source).toContain('["source_content_type", profile.sourceContentType]');
    expect(source).toContain("LEFT JOIN aff a_src_ct ON a_src_ct.dim = 'source_content_type'");
    expect(source).toContain("e.main_source_id || '::' || e.content_type::text");
  });
});
