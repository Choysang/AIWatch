import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const ENV_VARS = ["NODE_ENV", "CSP_ENFORCE"];
let saved: Record<string, string | undefined>;
const mutableEnv = process.env as Record<string, string | undefined>;

interface HeaderEntry {
  headers: Array<{ key: string; value: string }>;
}

beforeEach(() => {
  saved = {};
  for (const key of ENV_VARS) {
    saved[key] = process.env[key];
    delete mutableEnv[key];
  }
});

afterEach(() => {
  for (const key of ENV_VARS) {
    if (saved[key] === undefined) delete mutableEnv[key];
    else mutableEnv[key] = saved[key];
  }
});

async function headerKeys(): Promise<string[]> {
  const mod = await import(`../../next.config.ts?csp=${Date.now()}-${Math.random()}`) as {
    default: { headers?: () => Promise<HeaderEntry[]> };
  };
  const headers = await mod.default.headers?.();
  return headers?.flatMap((entry) => entry.headers.map((header) => header.key)) ?? [];
}

describe("next security headers", () => {
  test("production builds enforce CSP by default", async () => {
    mutableEnv["NODE_ENV"] = "production";

    expect(await headerKeys()).toContain("Content-Security-Policy");
  });

  test("development keeps CSP report-only unless explicitly enforced", async () => {
    mutableEnv["NODE_ENV"] = "development";

    expect(await headerKeys()).toContain("Content-Security-Policy-Report-Only");
  });
});
