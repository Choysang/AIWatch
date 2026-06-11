import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const aboutSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");

describe("about page", () => {
  test("is a jump page for feedback, README, and broadcast Skill", () => {
    expect(aboutSource).toContain('className="about-jump-grid"');
    expect(aboutSource).toContain("反馈与贡献");
    expect(aboutSource).toContain("README");
    expect(aboutSource).toContain("播报 Skill");
    expect(aboutSource).toContain('href="/feedback"');
    expect(aboutSource).toContain('href="/recommend-source"');
    expect(aboutSource).toContain("https://github.com/Choysang/AIWatch");
    expect(aboutSource).toContain('href="/aiwatch-skill"');
    expect(aboutSource).toContain('href="/aiwatch-skill/SKILL.md"');
  });
});
