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

## 2026-06-28 findings

- Production posts were still arriving on 2026-06-28, but events stopped after 2026-06-27 because recent posts remained in `provider_error`.
- RSSHub non-X routes were healthy, but the X source pool still had 81 disabled sources. The source alert job worked, but `SOURCE_ALERT_EMAIL` was unset, so it could only log.
- The reader homepage default limit of 30 made the timeline feel like only the latest few days existed even though older events were still in the database.
- Public report queries needed to hide invalid weekly/monthly rows that were generated before the correct schedule was enforced.

## Product rules reinforced

- Real-time feed refresh should preserve chronological ordering. New items should surface at the top when they are newer; avoid arbitrary re-ranking on refresh.
- Timeline dates must be rendered in `APP_TZ` (production: Asia/Shanghai), not server local time or browser guesses.
- Dynamic filters should only show source groups, categories, and source options that have content, while preserving an active selected filter so users can clear it.
- Button/card feedback should be subtle: immediate hover/pressed/focus states, no distracting motion.

## Engineering notes

- React Doctor findings are hypotheses. Fix high-confidence, behavior-preserving items first; do not blindly turn filter `role="group"` containers into `<address>`, and keep plain `<a>` for API/download links such as OPML export.
- Large `SearchBar` / `useReducer` refactors should be handled as a focused follow-up, not bundled into production incident fixes.
- Cursor pagination must use the exact same effective timestamp as the SQL ordering. If `mode=all` sorts by `published_at/promoted_at/created_at`, its cursor must also use that fallback order or older promoted-only events can disappear behind the cursor.
- Reader feed window filters must use the same effective timestamp as the reader ordering. A post created days ago but promoted today should not disappear from `mode=all&since=week`.
- Client-side feed freshness polling must preserve the active public query. Selected pages should poll selected items, filtered pages should poll the same filters, and personalized pages should skip public polling unless a personalized freshness endpoint exists.
- A small polling component can legitimately use a guarded `useEffect` with cancellation and in-flight protection; React Doctor's fetch-in-effect warning should still be reviewed on each edit, but do not replace it with a broad data-layer refactor during incident work.
- X/RSSHub outages often appear first as many healthy-looking X sources with `last_error` and `failure_count < degraded threshold`. Platform-level alerts should count this early-failure wave, not wait for every source to become degraded or disabled.

## Operational follow-ups

- Configure `SOURCE_ALERT_EMAIL`, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` in production if operator email alerts should actually send.
- After fixing RSSHub/X token, run `bun run scripts/reset-source-health.ts x`, then watch the next crawl and import/smoke-test any newly added X sources.
- After fixing an LLM provider outage, run `bun run scripts/rejudge-failed-posts.ts --hours 168 --limit 200` and confirm new events are created.
- If the reader says 精选 feels stale, check both `published_at` and `promoted_at`: selected cards are chosen at promotion time, while original articles may be older. The reader selected view should group by promotion time so today's curation is visible even when the original source date is earlier.
