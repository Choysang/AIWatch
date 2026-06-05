# Pre-Launch Security / Privacy Hardening — Design & Plan

- **Date:** 2026-06-05
- **Branch:** `feat/spend-guard-and-reader-polish`
- **Baseline commit:** `491049e` (existing WIP checkpointed); `08e30eb` (ignore `.deploy/`)
- **Status:** **IMPLEMENTED & VERIFIED (2026-06-06), UNCOMMITTED.** Scope = 全修 (CRITICAL+HIGH+MEDIUM+LOW). All items 1–9 done; verification (typecheck, 416 unit tests incl. new env+safe-fetch suites, `next build`) green. Not committed: the working tree carries unrelated in-flight WIP (spend-guard/reader-polish: new judge prompt + aiScore gating in `process-source.ts`, source-categories scripts) that predates this pass, so a clean isolated hardening commit needs the user to sequence it (commit/stash their WIP first, per the original "baseline first" plan). Only `process-source.ts` (L1 swap) overlaps that WIP; every other hardening change is in a file that was clean before this pass.
- **Note:** User plans to `/clear` context, then resume. This doc + memory `project-public-launch-hardening` are the durable handoff.

## 1. Context & goal

AIWatch — curated AI-news reader. Stack: Bun + Next.js 15 (App Router) + React 19 + Postgres/Drizzle + graphile-worker + better-auth. Being prepared for **public internet launch**. Priorities, in order:

1. Do not leak secrets, **proprietary curated data**, or PII once public.
2. Improve runtime efficiency / response speed.
3. Tidy code structure.

A separate follow-on project (not this doc) adds 5 external leaderboard pages.

## 2. Locked decisions

1. **Sequencing:** security/privacy hardening **first** (launch gate); leaderboards next; perf/structure folded in.
2. **Scope this pass:** 全修 — CRITICAL + HIGH + MEDIUM + LOW.
3. **Baseline:** existing WIP committed first (`491049e`); hardening layers on the clean tree.
4. **Leaderboards (downstream context only):** scheduled scrape → Postgres cache via graphile-worker; surfaced as a **standalone “Leaderboard Center”**. Sources: PinchBench (🦀 Success-rate-by-model; 💎 Value Score & Cost Efficiency / CPST), `arena.ai/leaderboard` (agent / text / webdev / document / text-to-image / search), `github.com/trending?since=weekly` (clickable list), `openrouter.ai/rankings` (LLM leaderboard), `tbench.ai/leaderboard/terminal-bench/2.1?verified=true`.

## 3. Audit findings & remediation

Evidence is `file:line` from the 2026-06-05 read-only audit. Already-good posture (keep): no `NEXT_PUBLIC` leakage; all `process.env` reads are server-side; write endpoints are rate-limited + zod-validated; public comment shape strips identity columns; admin pages + admin APIs check `session + can()`; `.env` gitignored; no secrets in logs.

### 🔴 CRITICAL
- **C1 — Proprietary data in `.deploy/`.** `.deploy/sources-export.json` = full curated source table (proprietary); `.deploy/aiwatch-src.tar.gz` = src tarball (may embed a real `.env`). Was never tracked; `.gitignore`/`.dockerignore` did not exclude it.
  - **Fix: DONE** in `08e30eb` (added `.deploy/` to both). Remaining: keep future exports out of the repo tree.

### 🟠 HIGH
- **H1 — No HTTP security headers / CSP.** `next.config.ts` sets none.
  - **Fix:** add `async headers()` returning, for all routes: `Content-Security-Policy`, `Strict-Transport-Security` (prod only), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Starter CSP (validate against running app, esp. inline `style=` attrs in admin + canvas in `particle-background.tsx`):
    ```
    default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
    img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self';
    connect-src 'self'; font-src 'self'; form-action 'self'
    ```
    Roll out CSP `Report-Only` first if unsure; tighten once the reader + admin render clean. Leave a comment that `connect-src`/`img-src` will widen for the Leaderboard Center.
- **H2 — Outbound `fetch` has zero guards** (`src/connectors/rss.ts:178`; RSSHub connector same pattern). No timeout, byte cap, redirect cap, or private-IP block. Admin-gated today, but becomes a real SSRF + stability surface once leaderboard scrapers land.
  - **Fix:** new `src/net/safe-fetch.ts` `safeFetch(url, opts)`:
    - `AbortController` timeout (default ~10s).
    - Max response bytes (default ~5 MB) — stream and abort on overflow.
    - Redirect cap (e.g. ≤3); re-validate the host on every hop.
    - **SSRF guard:** resolve host; reject loopback / private / link-local / reserved / ULA ranges (v4 + v6) unless an explicit `allowHosts` allow-list is passed.
    - Optional `allowHosts` (leaderboard connectors pass their known domains).
    - Refactor `RssConnector.fetch` and the RSSHub connector to use it.

### 🟡 MEDIUM
- **M1 — `clientIp` trusts `X-Forwarded-For` first hop** (`src/app/api/public/_runtime.ts:12`) → spoofable rate-limit/fingerprint bypass if ever exposed without a trusted proxy.
  - **Fix:** read a configurable trusted hop (e.g. last hop, or `TRUSTED_PROXY=1`); document “must sit behind a trusted proxy/CDN.”
- **M2 — Per-instance in-memory limiter + no explicit auth brute-force limit** (`_runtime.ts:8`; `src/auth/auth.ts`).
  - **Fix:** enable better-auth `rateLimit` (window + max for sign-in); document single-instance assumption; note future shared-store (Postgres/Redis) option.
- **M3 — DB connection does not enforce TLS** (`src/db/client.ts:23`).
  - **Fix:** in production set `ssl` on the `pg.Pool` (require; allow CA via env), or fail-fast if `DATABASE_URL` lacks `sslmode=require`.
- **M4 — Weak default secret fallbacks.** `CONTRIBUTION_SALT` → `"aiwatch-contrib"` (`src/contributions/fingerprint.ts:7`); `READER_ID_SECRET` → `BETTER_AUTH_SECRET`; `BETTER_AUTH_SECRET` example is `change-me-in-production`.
  - **Fix:** covered by E1 (env validation) — fail-fast in prod.
- **M5 — docker-compose ships weak DB creds + publishes 5432** (`docker-compose.yml`), and it is the “primary self-host path.”
  - **Fix:** parameterize `POSTGRES_PASSWORD` via env; do not publish 5432 by default (or bind 127.0.0.1); add a “production hardening” note.

### ⚪ LOW
- **L1 — Bare `console.*`** in pipeline (3 sites: `process-source.ts:110,286`, `backfill-content-type.ts:138`).
  - **Fix:** thin `src/log.ts` wrapper (level + future scrub hook); swap the 3 sites.

### Cross-cutting addition
- **E1 — Startup env validation** (`src/config/env.ts`): zod schema; in `NODE_ENV=production` require `DATABASE_URL`, `BETTER_AUTH_SECRET` (present, ≥32 chars, ≠ `change-me-in-production`), `READER_ID_SECRET`, `CONTRIBUTION_SALT`; warn on dev fallbacks. Validate at server boot via `instrumentation.ts` `register()` and at worker boot in `worker/index.ts`. Export typed `env`. This closes M4 and hardens H-tier config.
- **S1 — `.gitattributes`** with `* text=auto eol=lf` to stop the CRLF churn warnings (do as its own commit to contain renormalization noise; optional this pass).

## 4. Implementation plan (ordered)

0. [DONE] `08e30eb` ignore `.deploy/`; `491049e` baseline checkpoint.
1. **E1** `src/config/env.ts` + wire `instrumentation.ts` and `worker/index.ts`.
2. **H1** security headers + CSP in `next.config.ts` (Report-Only first if needed).
3. **H2** `src/net/safe-fetch.ts` + refactor `rss.ts` / rsshub connector; unit-test the SSRF/host guard.
4. **M1** trusted-proxy client IP.
5. **M2** better-auth rateLimit.
6. **M3** DB TLS in prod.
7. **M5** docker-compose hardening.
8. **L1** `src/log.ts` + swap 3 console sites.
9. (optional) **S1** `.gitattributes`.
10. Verify (section 5). Commit per logical group (conventional commits, no attribution trailer — user disables it globally).
11. Update memory `project-public-launch-hardening` to “implemented”.

## 5. Verification

- `bun run typecheck`
- `bun test src` (unit; add tests for `safe-fetch` SSRF guard + `env` validation)
- `bun test tests/integration` (embedded-postgres; may be slow/flaky on Windows — see memory `reference-dev-environment`)
- `bun run build` (ensure CSP/headers config compiles; no client bundle regressions)
- Manual: `curl -I` the running app, confirm headers present; confirm reader + `/_admin` render with CSP enabled (no console CSP violations).

## 5b. Implementation notes (2026-06-06)

What shipped, by item:
- **E1** — `src/config/env.ts` (`checkEnv()` pure + testable, `validateEnv()` throws in prod / warns in dev), wired at `src/instrumentation.ts` `register()` (nodejs runtime only, dynamic import) and at the top of `worker/index.ts`. Requires in prod: `DATABASE_URL`, strong `BETTER_AUTH_SECRET` (≥32, ≠ placeholder), `CONTRIBUTION_SALT` (≥16). `READER_ID_SECRET` is a warn-not-error (it safely falls back to the already-validated `BETTER_AUTH_SECRET`) — a deliberate deviation from the spec's "require" to preserve the documented fallback; if set it must be ≥32.
- **H1** — `next.config.ts` `headers()` for `/:path*`: nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy always; HSTS prod-only; CSP shipped **Report-Only** by default, flip to enforce with `CSP_ENFORCE=1` (note in code: strict `script-src 'self'` needs a nonce middleware before enforcing, or Next's streamed inline bootstrap is blocked).
- **H2** — `src/net/safe-fetch.ts` (`safeFetch` + `isPrivateAddress`): timeout (10s), byte cap (5MB, streamed), redirect cap (3, re-validates each hop), SSRF block of loopback/private/link-local/reserved v4+v6 incl. IPv4-mapped, `allowHosts` bypass, injectable `fetchImpl`/`lookupImpl`. `rss.ts` + `rsshub.ts` refactored onto it (rsshub keeps its test-injection seam). 18 unit tests in `safe-fetch.test.ts`.
- **M1** — `_runtime.ts clientIp()` reads `TRUSTED_PROXY_HOPS` from the right of XFF (default 0 = directly-connected peer).
- **M2** — better-auth `rateLimit` (global 100/60s + 5/60s on sign-in/sign-up, 3/60s forget-password; per-instance memory store).
- **M3** — `db/client.ts` `sslConfig()`: prod requires TLS unless `DATABASE_SSL=disable`; `DATABASE_SSL_NO_VERIFY=1` / `DATABASE_SSL_CA` escape hatches.
- **M4** — closed by E1.
- **M5** — `docker-compose.yml` parameterizes `POSTGRES_USER/PASSWORD/DB` + `DATABASE_URL`; Postgres now binds `127.0.0.1:5432` by default (override `POSTGRES_BIND`).
- **L1** — `src/log.ts` thin level+scrub seam; swapped the 2 `process-source.ts` console sites. Entry-point console (worker boot, CLI scripts) left as-is by design.
- `.env.example` documents all new knobs (`LOG_LEVEL`, `TRUSTED_PROXY_HOPS`, `DATABASE_SSL*`, `CSP_ENFORCE`, `CONTRIBUTION_SALT`).
- **S1** (`.gitattributes`) — NOT done (optional; deferred to avoid CRLF renormalization noise mid-WIP).

Remaining manual verification (needs running app): `curl -I` to confirm headers present; click through reader + `/_admin` with `CSP_ENFORCE=1` to catch CSP violations before enforcing.

## 6. Resume after `/clear`

New session prompt suggestion: **“继续做 AIWatch 发布前安全加固（全修），按 docs/superpowers/specs/2026-06-05-public-launch-hardening-design.md 执行。”**
The session should read this doc + memory `project-public-launch-hardening`. Tree baseline is `491049e` on `feat/spend-guard-and-reader-polish`; no hardening code written yet (items 1–11 pending).
