// Startup environment validation (E1). Fail-fast in production on missing or weak
// secrets/config so a misconfigured deploy never boots with the dev fallbacks that M4
// flagged. Called explicitly at server boot (src/instrumentation.ts) and worker boot
// (worker/index.ts) — NOT at import time, so `next build` and tests that set env later
// keep working (mirrors the lazy db/client.ts contract).
//
// checkEnv() is pure and takes the env record, so unit tests can exercise every branch
// without mutating process.env.

import { log } from "@/log";

/** The example placeholder shipped in .env.example — never valid in production. */
const PLACEHOLDER_AUTH_SECRET = "change-me-in-production";
const MIN_SECRET_LENGTH = 32;
const MIN_SALT_LENGTH = 16;
const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "qwen",
  "openai_compatible",
  "stub",
] as const;
const LLM_PROVIDER_SET: ReadonlySet<string> = new Set(LLM_PROVIDERS);
const LLM_PROVIDER_KEYS: Record<Exclude<(typeof LLM_PROVIDERS)[number], "stub">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "QWEN_API_KEY",
  openai_compatible: "OPENAI_COMPATIBLE_API_KEY",
};

export interface EnvCheckResult {
  /** True when there are no hard errors for the given NODE_ENV. */
  ok: boolean;
  /** Fatal problems (production only): boot must abort. */
  errors: string[];
  /** Non-fatal problems: logged, boot continues (dev fallbacks in use, etc.). */
  warnings: string[];
}

type EnvSource = Record<string, string | undefined>;
type LlmProvider = (typeof LLM_PROVIDERS)[number];

function configuredProviderChain(
  source: EnvSource,
  envNames: string[],
  fallback: LlmProvider,
): LlmProvider {
  for (const envName of envNames) {
    const value = source[envName]?.trim();
    if (value && LLM_PROVIDER_SET.has(value)) return value as LlmProvider;
  }
  return fallback;
}

function requireLlmProviderKey(
  source: EnvSource,
  task: "light_judge" | "deep_extract",
  provider: LlmProvider,
  fail: (msg: string) => void,
): void {
  if (provider === "stub" || source.LLM_STUB_FALLBACK === "1") return;
  const keyName = LLM_PROVIDER_KEYS[provider];
  if (!source[keyName]?.trim()) {
    fail(`${keyName} is not set; ${task} routes to ${provider} and will accumulate judge_failed`);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate the runtime environment. Production raises a hard error for anything that
 * would weaken security; development downgrades the same findings to warnings so local
 * work with `.env` defaults is frictionless.
 */
export function checkEnv(source: EnvSource = process.env): EnvCheckResult {
  const isProd = source.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string): void => void (isProd ? errors : warnings).push(msg);

  // DATABASE_URL — required to do anything; the pool reads it on first query regardless,
  // but failing here turns a deferred runtime crash into an explicit boot error.
  if (!source.DATABASE_URL) {
    fail("DATABASE_URL is not set");
  } else if (isProd && !/\bsslmode=require\b/.test(source.DATABASE_URL) && source.DATABASE_SSL !== "disable") {
    // M3 reminder; client.ts also enforces TLS via the pg.Pool ssl option in production.
    warnings.push(
      "DATABASE_URL has no sslmode=require — production DB connections should use TLS (see DATABASE_SSL).",
    );
  }

  const trustedProxyHops = source.TRUSTED_PROXY_HOPS?.trim();
  if (!trustedProxyHops) {
    fail("TRUSTED_PROXY_HOPS is not set; set 0 for direct exposure or the trusted CDN/proxy count");
  } else if (!/^\d+$/.test(trustedProxyHops)) {
    fail("TRUSTED_PROXY_HOPS must be a non-negative integer");
  }

  if (source.CSP_ENFORCE !== "1") {
    fail("CSP_ENFORCE must be set to 1 in production so CSP blocks instead of only reporting");
  }

  // BETTER_AUTH_SECRET — signs sessions; must be strong and never the shipped placeholder.
  const authSecret = source.BETTER_AUTH_SECRET;
  if (!authSecret) {
    fail("BETTER_AUTH_SECRET is not set");
  } else {
    if (authSecret === PLACEHOLDER_AUTH_SECRET) {
      fail(`BETTER_AUTH_SECRET is the example placeholder "${PLACEHOLDER_AUTH_SECRET}"; set a real secret`);
    }
    if (authSecret.length < MIN_SECRET_LENGTH) {
      fail(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
  }

  // READER_ID_SECRET — anonymous reader-cookie HMAC. Production requires a distinct
  // secret so rotating auth sessions does not also invalidate reader identities, and so
  // exposure of one signing secret does not imply exposure of the other.
  const readerSecret = source.READER_ID_SECRET;
  if (!readerSecret) {
    fail("READER_ID_SECRET is not set");
  } else if (readerSecret.length < MIN_SECRET_LENGTH) {
    fail(`READER_ID_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  } else if (readerSecret === authSecret) {
    fail("READER_ID_SECRET must be distinct from BETTER_AUTH_SECRET");
  }

  // CONTRIBUTION_SALT — salts anonymous contributor fingerprints. The "aiwatch-contrib"
  // default (M4) is fine for dev but predictable; require a real salt in production.
  const salt = source.CONTRIBUTION_SALT;
  if (!salt) {
    fail("CONTRIBUTION_SALT is not set");
  } else if (salt.length < MIN_SALT_LENGTH) {
    fail(`CONTRIBUTION_SALT must be at least ${MIN_SALT_LENGTH} characters`);
  }

  if (!source.RSSHUB_BASE_URL?.trim() && !source.RSSHUB_URL?.trim()) {
    warnings.push("RSSHUB_BASE_URL is not set; rsshub connector sources will fail closed if enabled");
  }

  const publicBaseUrl = source.PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) {
    warnings.push("PUBLIC_BASE_URL is not set; RSS links will fall back to the request origin");
  } else if (!isHttpUrl(publicBaseUrl)) {
    fail("PUBLIC_BASE_URL must be an absolute http(s) URL");
  }

  const lightProvider = configuredProviderChain(
    source,
    ["LLM_PROVIDER", "LLM_LIGHT_PROVIDER", "LLM_NEWS_PROVIDER"],
    "deepseek",
  );
  const deepProvider = configuredProviderChain(
    source,
    ["LLM_PROVIDER", "LLM_DEEP_PROVIDER", "LLM_NEWS_PROVIDER"],
    "deepseek",
  );
  requireLlmProviderKey(source, "light_judge", lightProvider, fail);
  requireLlmProviderKey(source, "deep_extract", deepProvider, fail);

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Run checkEnv against process.env, log any warnings, and throw on hard errors.
 * Call once at server/worker boot.
 */
export function validateEnv(source: EnvSource = process.env): void {
  const { ok, errors, warnings } = checkEnv(source);
  for (const w of warnings) log.warn(`[env] ${w}`);
  if (!ok) {
    throw new Error(`[env] invalid environment — refusing to start:\n- ${errors.join("\n- ")}`);
  }
}
