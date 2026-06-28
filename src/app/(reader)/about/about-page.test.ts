import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const aboutSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("about page", () => {
  test("keeps quick-start context and removes duplicate feedback/skill entry cards", () => {
    expect(aboutSource).toContain('className="about-jump-grid"');
    expect(aboutSource).toContain("怎么阅读");
    expect(aboutSource).toContain("主要功能");
    expect(aboutSource).toContain("组件思路");
    expect(aboutSource).toContain("README");
    expect(aboutSource).toContain("https://github.com/Choysang/AIWatch");
    expect(aboutSource).not.toContain("反馈与贡献");
    expect(aboutSource).not.toContain("播报 Skill");
    expect(aboutSource).not.toContain('href="/feedback"');
    expect(aboutSource).not.toContain('href="/recommend-source"');
    expect(aboutSource).not.toContain('href="/aiwatch-skill"');
  });
});