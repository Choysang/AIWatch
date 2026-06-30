# AIWatch Iteration Memory

This file captures recurring operating lessons for future AIWatch updates. Read it before each production iteration.

## Pre-update checks

1. Check production worker logs for LLM provider errors, source failures, deadlocks, and report generation.
2. Check RSSHub health and Twitter/X token symptoms: many X sources in `disabled` or `degraded` usually means RSSHub auth/token failure.
3. Check database freshness separately for `posts` and `events`. If posts are fresh but events are stale, investigate LLM judging and run rejudge after fixing the provider.
4. Review recent feedback and source recommendations in `/_admin` before changing UX or source policy.
5. When adding a curated source, import it and immediately connector-smoke-test the latest item. Treat DB insertion and successful crawl as separate facts.
6. Before every scoring/promotion update, inspect owner/admin `useful` / `not_useful` annotations. Confirm the owner-affinity profile is applied by both `recompute-rank-scores` and `check-promotion-v2`; useful patterns should lift similar cards, not-useful patterns should suppress selection and eventually flag sources for review rather than silently deleting sources.
7. When many sources cover the same story, verify the fold/canonical-url path found the earliest original post where possible. Repeated reposts should attach as `same_event` sources and lift `source_count`, not create duplicate reader cards.
8. Treat Loop Engineering as ongoing, not done: before each release, review source fault handling, preference-impact explainability, multi-source event views, source import smoke tests, ops cleanup, markdown export, and the site AI assistant backlog.

## 2026-06-28 findings

- Production posts were still arriving on 2026-06-28, but events stopped after 2026-06-27 because recent posts remained in `provider_error`.
- RSSHub non-X routes were healthy, but the X source pool still had 81 disabled sources. The source alert job worked, but `SOURCE_ALERT_EMAIL` was unset, so it could only log.
- The reader homepage default limit of 30 made the timeline feel like only the latest few days existed even though older events were still in the database.
- Public report queries needed to hide invalid weekly/monthly rows that were generated before the correct schedule was enforced.

## Product rules reinforced

- Real-time feed refresh should preserve chronological ordering. New items should surface at the top when they are newer; avoid arbitrary re-ranking on refresh.
- Timeline dates must be rendered in `APP_TZ` (production: Asia/Shanghai), not server local time or browser guesses.
- Dynamic filters should only show source groups, categories, and source options that have content, while preserving an active selected filter so users can clear it.
- Source filtering has two axes: reader-facing source groups (official/expert/media/community) and source taxonomy categories (official/industry_leader/technical_share/media/community/open_source). Keep the UI, `SOURCE_CATEGORIES`, import form, and about/README wording in sync.
- Button/card feedback should be subtle: immediate hover/pressed/focus states, no distracting motion.
- Tooltips should explain the effect of a button, not repeat the visible label. For feedback buttons, name the ranking/folding consequence.

## Engineering notes

- React Doctor findings are hypotheses. Fix high-confidence, behavior-preserving items first; do not blindly turn filter `role="group"` containers into `<address>`, and keep plain `<a>` for API/download links such as OPML export.
- Large `SearchBar` / `useReducer` refactors should be handled as a focused follow-up, not bundled into production incident fixes.
- Cursor pagination must use the exact same effective timestamp as the SQL ordering. If `mode=all` sorts by `published_at/promoted_at/created_at`, its cursor must also use that fallback order or older promoted-only events can disappear behind the cursor.
- Reader feed window filters must use the same effective timestamp as the reader ordering. A post created days ago but promoted today should not disappear from `mode=all&since=week`.
- Client-side feed freshness polling must preserve the active public query. Selected pages should poll selected items, filtered pages should poll the same filters, and personalized pages should skip public polling unless a personalized freshness endpoint exists.
- A small polling component can legitimately use a guarded `useEffect` with cancellation and in-flight protection; React Doctor's fetch-in-effect warning should still be reviewed on each edit, but do not replace it with a broad data-layer refactor during incident work.
- X/RSSHub outages often appear first as many healthy-looking X sources with `last_error` and `failure_count < degraded threshold`. Platform-level alerts should count this early-failure wave, not wait for every source to become degraded or disabled.
- After the upstream cause is fixed, `reset-source-health.ts x` should clear both degraded/disabled sources and healthy-looking rows that still carry stale `failure_count` / `last_error`; otherwise the admin console keeps reporting a ghost outage.
- Production one-shot verification commands must pass the same `IMAGE_TAG=sha-...` as the deployed services. Running `docker compose run worker ...` without it can silently use a stale local `latest` image and produce false findings.
- `crawl-source` jobs must use a stable per-source job key plus a short retry cap. If the job key includes a time bucket, one slow RSSHub/X source can stack many retry jobs and make the site look like it stopped updating.
- Do not perform live source fetch probes during admin page SSR. The console should render from stored DB health and provide explicit audit/retest actions; fetching every managed source on page load makes navigation feel broken and can amplify upstream outages.
- Owner/admin triage is a reader-only workflow: hide all already annotated cards for owner/admin feeds, but public feeds should only suppress owner `not_useful` events so useful content remains visible to ordinary readers.
- Admin dashboard queries must pre-aggregate recent windows before joining to `sources`; joining all historical posts/events and then filtering inside aggregates makes `/_admin` feel like a broken link as the database grows.
- If `metadata.icons` points to `/icon.svg`, verify the file exists in `public/`; otherwise mobile browsers can fall back to unreadable placeholder icons.
- Curated-source import smoke tests must change source state, not only print logs: empty/error fetch means disable the newly created source and store `[import-smoke] ...` in `last_error`.
- Markdown export should keep the built-in Obsidian/frontmatter path but also offer a local template with simple `{{field}}` placeholders for readers who maintain their own vault conventions.
- Source connectivity audits should be gentle on RSSHub: use low concurrency plus longer timeout/retry, then probe a known-good X route before blaming `TWITTER_AUTH_TOKEN`; route-level 503 is different from global token failure.
- X/RSSHub crawling must be paced. With one `TWITTER_AUTH_TOKEN`, a restart that enqueues dozens of X sources at once can turn into widespread `Twitter API error: 401`; keep worker concurrency and enqueue limits conservative unless multiple healthy tokens exist.
- Enqueue pacing must live in code, not runbook memory: keep `RSSHUB_X_ENQUEUE_LIMIT` low and stagger X jobs (`RSSHUB_X_STAGGER_MS`) so one token is not hit by parallel `/twitter/user/*` probes after deploy or source-health reset.
- Some RSSHub routes are simply slow rather than dead (`/anthropic/research` ranged from ~42s to 60s+ in production on 2026-06-30). Keep the connector timeout comfortably above the observed p95 before disabling or replacing a source.

## Operational follow-ups

- Configure `SOURCE_ALERT_EMAIL`, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` in production if operator email alerts should actually send.
- After fixing RSSHub/X token, run `bun run scripts/reset-source-health.ts x`, then watch the next crawl and import/smoke-test any newly added X sources.
- After fixing an LLM provider outage, run `bun run scripts/rejudge-failed-posts.ts --hours 168 --limit 200` and confirm new events are created.
- If the reader says 精选 feels stale, check both `published_at` and `promoted_at`: selected cards are chosen at promotion time, while original articles may be older. The reader selected view should group by promotion time so today's curation is visible even when the original source date is earlier.

## Loop Engineering backlog (ongoing)

- Fault desk: show X token status, RSSHub health, failing sources, last errors, retry counts, suggested actions, and one-click retest.
- Preference impact: after an owner verdict, explain changed source/category/tag/keyword affinity and the expected scoring delta.
- Multi-source event view: for a hot event, compare official / English / Chinese / developer / X coverage and surface shared facts versus disagreements.
- Source import wizard: never mark a newly imported source enabled until the latest-item smoke test succeeds; store the failure reason when it does not.
- Ops cleanup panel: disk, old Docker images, logs, RSSHub token symptoms, and LLM budget should live in the admin dashboard.
- Knowledge export: event detail should export Markdown with Obsidian-friendly frontmatter carrying date, source, category, content type, tags, score, selected level, and original URL.
- Site AI assistant: global assistant should answer how to use AIWatch, summarize current page content, explain filters/boards/reports, and respect public/admin data boundaries.

Recommended rollout order from the 2026-06-30 loop review:

1. Build a source fault desk first, using existing `sources.health_status`, `failure_count`, `last_error`, `last_fetch_at`, `next_fetch_at`, and single-source retest actions.
2. Add `Why shown?` / preference-impact explanations from deterministic score breakdowns and owner affinity, not ad hoc LLM prose.
3. Add multi-source event lanes on details: official, developer, X, English media, Chinese media; separate consensus from unconfirmed or lane-specific claims.
4. Add Markdown / Obsidian export with compact YAML frontmatter and source links in the body rather than huge nested frontmatter arrays.
5. Add the AI assistant last: read-only first, permission-inherited, citation-first, no write actions without explicit confirmation.
