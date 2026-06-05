import { describe, expect, test } from "bun:test";
import { checkEnv } from "./env";

const STRONG_SECRET = "x".repeat(32);
const STRONG_SALT = "s".repeat(16);

function prodEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://u:p@db:5432/app?sslmode=require",
    BETTER_AUTH_SECRET: STRONG_SECRET,
    READER_ID_SECRET: STRONG_SECRET,
    CONTRIBUTION_SALT: STRONG_SALT,
    ...overrides,
  };
}

describe("checkEnv", () => {
  test("passes with a fully configured production environment", () => {
    const result = checkEnv(prodEnv());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("fails when BETTER_AUTH_SECRET is the example placeholder in production", () => {
    const result = checkEnv(prodEnv({ BETTER_AUTH_SECRET: "change-me-in-production" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("BETTER_AUTH_SECRET");
  });

  test("fails when BETTER_AUTH_SECRET is too short in production", () => {
    const result = checkEnv(prodEnv({ BETTER_AUTH_SECRET: "short" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("at least 32");
  });

  test("fails when CONTRIBUTION_SALT is missing in production", () => {
    const result = checkEnv(prodEnv({ CONTRIBUTION_SALT: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("CONTRIBUTION_SALT");
  });

  test("fails when DATABASE_URL is missing in production", () => {
    const result = checkEnv(prodEnv({ DATABASE_URL: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("DATABASE_URL");
  });

  test("unset READER_ID_SECRET is a warning, not an error (falls back to auth secret)", () => {
    const result = checkEnv(prodEnv({ READER_ID_SECRET: undefined }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("READER_ID_SECRET");
  });

  test("warns when production DATABASE_URL lacks sslmode=require", () => {
    const result = checkEnv(prodEnv({ DATABASE_URL: "postgres://u:p@db:5432/app" }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("sslmode=require");
  });

  test("development downgrades all hard findings to warnings", () => {
    const result = checkEnv({ NODE_ENV: "development" });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
