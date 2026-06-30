import { describe, expect, test } from "bun:test";
import { checkEnv } from "./env";

const STRONG_SECRET = "x".repeat(32);
const STRONG_READER_SECRET = "r".repeat(32);
const STRONG_SALT = "s".repeat(16);

function prodEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://u:p@db:5432/app?sslmode=require",
    TRUSTED_PROXY_HOPS: "1",
    CSP_ENFORCE: "1",
    PUBLIC_BASE_URL: "https://aiwatch.icu",
    BETTER_AUTH_SECRET: STRONG_SECRET,
    READER_ID_SECRET: STRONG_READER_SECRET,
    CONTRIBUTION_SALT: STRONG_SALT,
    OPENAI_COMPATIBLE_API_KEY: "sk-test",
    OPENAI_COMPATIBLE_BASE_URL: "https://example.test/v1",
    RSSHUB_BASE_URL: "http://rsshub:1200",
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

  test("fails when TRUSTED_PROXY_HOPS is missing in production", () => {
    const result = checkEnv(prodEnv({ TRUSTED_PROXY_HOPS: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("TRUSTED_PROXY_HOPS");
  });

  test("fails when TRUSTED_PROXY_HOPS is not a non-negative integer in production", () => {
    const result = checkEnv(prodEnv({ TRUSTED_PROXY_HOPS: "1.5" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("non-negative integer");
  });

  test("allows explicit TRUSTED_PROXY_HOPS=0 for direct production deployments", () => {
    const result = checkEnv(prodEnv({ TRUSTED_PROXY_HOPS: "0" }));
    expect(result.ok).toBe(true);
  });

  test("fails when CSP_ENFORCE is not enabled in production", () => {
    const result = checkEnv(prodEnv({ CSP_ENFORCE: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("CSP_ENFORCE");
  });

  test("fails when READER_ID_SECRET is missing in production", () => {
    const result = checkEnv(prodEnv({ READER_ID_SECRET: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("READER_ID_SECRET");
  });

  test("fails when READER_ID_SECRET reuses BETTER_AUTH_SECRET in production", () => {
    const result = checkEnv(prodEnv({ READER_ID_SECRET: STRONG_SECRET }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("distinct");
  });

  test("warns when production DATABASE_URL lacks sslmode=require", () => {
    const result = checkEnv(prodEnv({ DATABASE_URL: "postgres://u:p@db:5432/app" }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("sslmode=require");
  });

  test("warns when RSSHUB_BASE_URL is missing in production", () => {
    const result = checkEnv(prodEnv({ RSSHUB_BASE_URL: undefined }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("RSSHUB_BASE_URL");
  });

  test("warns when PUBLIC_BASE_URL is missing in production", () => {
    const result = checkEnv(prodEnv({ PUBLIC_BASE_URL: undefined }));
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("PUBLIC_BASE_URL");
  });

  test("fails when PUBLIC_BASE_URL is not an absolute http(s) URL in production", () => {
    const result = checkEnv(prodEnv({ PUBLIC_BASE_URL: "aiwatch.icu" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("PUBLIC_BASE_URL");
  });

  test("fails when default light and deep LLM routes have no OpenAI-compatible key in production", () => {
    const result = checkEnv(prodEnv({ OPENAI_COMPATIBLE_API_KEY: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("OPENAI_COMPATIBLE_API_KEY");
  });

  test("fails when default OpenAI-compatible routes have no base URL in production", () => {
    const result = checkEnv(prodEnv({ OPENAI_COMPATIBLE_BASE_URL: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("OPENAI_COMPATIBLE_BASE_URL");
  });

  test("allows replacing the default OpenAI-compatible light and deep routes with another keyed provider", () => {
    const result = checkEnv(prodEnv({
      OPENAI_COMPATIBLE_API_KEY: undefined,
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    }));
    expect(result.ok).toBe(true);
  });

  test("development downgrades all hard findings to warnings", () => {
    const result = checkEnv({ NODE_ENV: "development" });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
