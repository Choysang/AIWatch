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

export interface EnvCheckResult {
  /** True when there are no hard errors for the given NODE_ENV. */
  ok: boolean;
  /** Fatal problems (production only): boot must abort. */
  errors: string[];
  /** Non-fatal problems: logged, boot continues (dev fallbacks in use, etc.). */
  warnings: string[];
}

type EnvSource = Record<string, string | undefined>;

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

  // READER_ID_SECRET — anonymous reaction-cookie HMAC. By design it falls back to
  // BETTER_AUTH_SECRET (already validated above), so an unset value is a warning, not an
  // error; but a value that IS set must still be strong.
  const readerSecret = source.READER_ID_SECRET;
  if (!readerSecret) {
    if (isProd) {
      warnings.push("READER_ID_SECRET is not set; falling back to BETTER_AUTH_SECRET. Set a distinct value in production.");
    }
  } else if (readerSecret.length < MIN_SECRET_LENGTH) {
    fail(`READER_ID_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  // CONTRIBUTION_SALT — salts anonymous contributor fingerprints. The "aiwatch-contrib"
  // default (M4) is fine for dev but predictable; require a real salt in production.
  const salt = source.CONTRIBUTION_SALT;
  if (!salt) {
    fail("CONTRIBUTION_SALT is not set");
  } else if (salt.length < MIN_SALT_LENGTH) {
    fail(`CONTRIBUTION_SALT must be at least ${MIN_SALT_LENGTH} characters`);
  }

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
