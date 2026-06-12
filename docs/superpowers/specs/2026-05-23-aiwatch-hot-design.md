# AIWatch Hot Design

## Status

Approved design draft.

## Product Goal

AIWatch helps Chinese AI practitioners, builders, creators, and power users avoid missing important AI developments without reading hundreds of daily posts. The product prioritizes:

- A: industry hot topics, discussion, and propagation.
- B: practical product/model/API/tool updates that users may need to act on.

Research-heavy content is supported but intentionally de-weighted unless it affects products, models, open source adoption, or community practice.

## Core Assumptions

- The site should not be a full AI-news firehose.
- The default feed can be broad, but selected content must be scarce and explainable.
- LLMs should produce structured judgments and summaries, not final editorial decisions.
- Final scoring, promotion, ranking, decay, source contribution, and follow-up scheduling should be encoded in deterministic rules.
- Language is only a reading aid. English and Chinese content should be judged by source distance, signal quality, and usefulness, not by language.
- The main content object is an event, not an article or post.

## Non-Goals For V1

- Full personalized recommendation.
- Full MCP server.
- Complex semantic search.
- Deep comment crawling for every item.
- Automatic public weekly/monthly reports without review.
- A large social network or complex community system.
- Crawling hundreds of low-quality sources for coverage optics.

## Information Architecture

### All AI Dynamics

The default page shows all AI dynamics by time order.

Filters:

- Source kind: first-party source, news, tweet/social post, video, paper, open source.
- Category: model, product, industry, paper, technique.
- Search: keyword search over event title, summary, tags, source name, and associated post titles.

### Selected

The selected module shows promoted events.

Default sort:

- Most recently promoted first.

Views:

- Latest selected.
- 24h heat.
- Weekly focus.
- Monthly impact.

Filters:

- Selected level: B, A, S.
- Category: model, product, industry, paper, technique.
- Search.

Level semantics:

- B: daily selected.
- A: weekly selected.
- S: monthly selected.

### Reports

Daily report:

- Generated every day at 08:00.
- Can be automatically published.
- Based on events, not posts.

Weekly report:

- Automatically generated, manually reviewed before publishing.
- Summarizes trends, reversals, and 7-day follow-up.

Monthly report:

- Automatically drafted, expert or admin reviewed before publishing.
- Represents editorial judgment and long-term archive value.

## Core Data Model

### Source

A source is a maintained channel that can produce posts or events.

Fields:

- platform: X, GitHub, Reddit, official blog, Zhihu, CSDN, RSS, news site, YouTube, Bilibili.
- name.
- handle.
- url.
- source_type: official, employee, expert, KOL, media, community, open-source project.
- level: L1-L5.
- categories: model, product, agent, open source, industry, paper, technique.
- description.
- adoption_reason.
- adopted_by.
- adopted_at.
- status: pending, approved, paused, removed.
- last_fetched_at.
- recent_valid_hit_count.
- daily_featured_count.
- weekly_featured_count.
- monthly_featured_count.
- weekly_featured_rate.
- monthly_featured_rate.
- duplicate_rate.
- false_positive_rate.
- first_party_rate.
- source_consensus_score.

Public source directory shows:

- platform.
- name and handle.
- type.
- categories.
- adoption reason.
- adopted by.
- adopted time.
- recent selected contribution.
- original link.

Users can recommend a source with:

- link.
- recommendation reason.
- optional categories.

Admins or selected authors review and approve sources.

### Reference Source Set

Reference source sets are competitor or public source directories used to estimate consensus.

Initial reference sets:

- Metacurate.
- AI News Hub.
- TensorFeed.
- Modelwire.
- CassadyNet.
- ClawDigest.
- NewClaw.
- aibytes.

Consensus strength:

- 3 or more reference sets: strong.
- 2 reference sets: medium.
- 1 reference set: weak.
- 0 reference sets: needs expert or admin reason.

The consensus score is used as an audit aid, not as automatic truth.

### Post

A post is an original item fetched from a source.

Fields:

- source_id.
- author_name.
- author_handle.
- platform.
- url.
- raw_title.
- display_title.
- title_source: original, first_sentence, ai_generated.
- raw_content.
- summary.
- media: videos, images.
- published_at.
- public_metrics: likes, reposts, replies, quotes, stars, comments.
- fetched_at.
- initial_relevance_status.

Title rule:

- Use original title first.
- For short social posts without a title, use the first sentence or neutral AI-generated title.
- AI titles must avoid hype words and must not distort claims.

### Event

An event is the canonical content object shown to users.

Fields:

- title.
- summary.
- recommendation_reason.
- main_source_id.
- main_post_id.
- source_confidence_note.
- category.
- tags.
- quality_score.
- rank_score.
- promotion_score.
- selected_level: none, B, A, S.
- selected_label: daily selected, weekly selected, monthly selected.
- published_at.
- promoted_at.
- last_strong_signal_at.
- media.
- associated_posts.
- related_events.

Main source priority:

1. Official original publication: official site, blog, docs, GitHub release, official X.
2. Original author: paper author, open-source author, product lead, core employee.
3. First credible disclosure source, when no official source exists.
4. Earliest discovery source, only when original source cannot be determined.

If a better main source is found later, the main source can be corrected with audit logging.

### Merge And Association

High-confidence merge:

- Same original URL.
- Official source points to same release.
- Title, entity, time, and link are highly consistent.

Medium-confidence association:

- Same company/product/time window.
- Similar topic but different angle.
- Shown as related dynamics, not merged.

Low-confidence:

- Keyword similarity only.
- No shared entity, link, or clear event relation.
- No association.

Front-end event details show:

- Same-event sources.
- Related dynamics.
- Follow-up discussion.

For large launches, use:

- One umbrella event.
- Up to three high-value child events.

Example:

- OpenAI spring launch.
- Child: new model.
- Child: API price or capability change.
- Child: user-facing product update.

## Source Strategy

V1 should start with 80-120 high-quality sources.

Approximate mix:

- Official first-party sources: 25-35.
- Core individual X accounts: 25-40.
- Community/open-source sources: 10-15.
- English media and analysis: 10-15.
- Chinese media and discussion: 10-15.
- Technique/tutorial sources: 5-10.

Initial groups:

- L1 official first-party: OpenAI, Anthropic, Google DeepMind, Google AI, Meta AI, xAI, Microsoft AI, NVIDIA, Hugging Face, Mistral, Cohere, Stability AI, DeepSeek, Alibaba/Qwen, Baidu, Z.ai, Moonshot, ByteDance, Xiaomi.
- L2 core people: founders, research leads, product leads, core engineers, mainly via X.
- L3 community and practice: X, Reddit, Hacker News, GitHub Trending, Hugging Face Daily Papers, Zhihu.
- L4 media and information: TechCrunch, The Verge, Wired, MIT Technology Review, VentureBeat, Ars Technica, The Decoder, The Register, Axios, Semafor, 机器之心, 量子位, 36氪, 爱范儿.
- L5 technique/tutorial: CSDN, 掘金, 博客园, Dev.to, YouTube, Bilibili.

Fetch frequency:

- L1: every 5-15 minutes.
- L2: every 10-30 minutes.
- L3: every 30-60 minutes.
- L4: every 1-3 hours.
- L5: low frequency or used as supplemental source.

System can suggest pausing a source:

- 30 days low selected rate plus high false-positive rate: mark for review.
- 60 days no effective contribution: suggest pause.
- Human confirmation is required before pausing.

Source selected contribution is counted only when the source is the event main source.

Associated sources can contribute:

- Citation quality.
- Comment quality.
- Context completeness.
- Secondary propagation.

They do not count toward selected contribution volume.

## Scoring System

The system uses separate scores:

- quality_score: public 0-100 display score.
- rank_score: feed and list sorting score.
- promotion_score: selected-level promotion score.
- source_quality_score: source governance score.

LLMs can produce structured dimension scores, but deterministic code computes the final scores.

Suggested LLM dimensions:

- AI relevance.
- Practical impact.
- Novelty.
- Audience usefulness.
- Evidence clarity.

Candidate base score:

```text
base_score =
  source_score * 0.20
  + ai_relevance_score * 0.15
  + impact_score * 0.20
  + novelty_score * 0.10
  + external_heat_score * 0.15
  + user_value_score * 0.10
  + expert_value_score * 0.10
```

Promotion score for A/S candidates:

```text
promotion_score =
  base_score * 0.55
  + expert_value_score * 0.20
  + citation_quality_score * 0.15
  + comment_quality_score * 0.10
```

User score should use Wilson or Bayesian-style confidence rather than raw likes.

Expert votes are weighted by role and domain. Expert weight is strong but not absolute.

Public display score decays toward level floor:

```text
display_score =
  grade_floor[level] + (peak_score - grade_floor[level]) * decay(age_since_last_strong_signal)
```

Grade floors:

- B: 75.
- A: 86.
- S: 94.

Selected levels do not downgrade, but scores decay toward their floor and rank scores fall with time unless new strong signals arrive.

Rank score:

```text
rank_score =
  display_score
  * freshness_decay
  + recent_user_signal
  + recent_expert_signal
  + recent_external_heat
  + citation_boost
```

Source quality score:

```text
source_quality_score =
  selected_rate * 0.35
  + first_party_rate * 0.25
  + expert_adoption_rate * 0.15
  + low_duplicate_rate * 0.15
  + low_false_positive_rate * 0.10
```

## Promotion Rules

Promotion is tournament-like: an event must pass thresholds and then compete for limited slots.

B / daily selected:

- score >= 75, or certified expert direct-push.
- Must be AI-related.
- Must not be low-quality duplicate or empty repost.
- Limit: 10-30 per day.
- Follow-up: immediate and 24h.

A / weekly selected:

- Must already be B.
- score >= 86.
- Must satisfy at least two strong signals:
  - expert star.
  - high user stars.
  - external heat growth.
  - high-quality comments.
  - citation growth.
- Limit: 10-20 per week.
- Follow-up: immediate, 24h, and 7d.

S / monthly selected:

- Must already be A.
- score >= 94.
- Must satisfy at least three strong signals.
- Must show cross-time feedback, such as 24h growth or 7d valid discussion.
- Limit: 3-8 per month.
- Follow-up: immediate, 24h, 7d, and 30d.

Expert permissions:

- Certified experts can direct-push an event into B.
- A and S require other signals.
- Expert operations require audit logs: actor, event, action, time, reason.
- Expert weight can be domain-specific.

## User Feedback

User actions:

- Like: this was useful now.
- Star: this is worth deeper study.
- Comment: discussion around the event.

Likes affect near-term daily selected ranking.

Stars affect weekly/monthly selection and follow-up priority.

User feedback weight changes over time:

- 0-6h: external heat is more important.
- 6-24h: external heat and user feedback are close.
- 24h-7d: user stars and expert value dominate.
- 7d+: expert value, user stars, and valid comment quality dominate.

Professional/expert evaluation takes priority when user feedback and external heat conflict, but only through weighted formulas and promotion rules.

## Comments And Follow-Up

Comments are centered on events, not posts.

Event comment sections:

- Expert views.
- High-quality discussion.
- Latest comments.

Post comments from source platforms are fetched and summarized only for selected events.

Valid feedback categories:

- Valid praise: specific benefits, such as cheaper, faster, more stable, better for a scenario.
- Valid criticism: specific issues, such as hallucination, price, restrictions, availability, reproduction failure.
- Hands-on feedback: actual usage, screenshots, benchmark, code, failure cases.
- Supplemental information: docs, alternatives, background, comparable products.
- Controversy focus: what people disagree about and whether there is misunderstanding or exaggeration.

Low-value comments are filtered:

- Empty hype.
- Memes or pure stance-taking.
- Unsourced conspiracy claims.
- Title reposts.
- Ads or lead generation.

Reports can quote expert comments only when:

- The comment is public.
- The expert allows report quoting.
- Source attribution is retained.

Private expert notes can affect score but are not shown or quoted.

## Reports

Daily report sections:

- Today focus: B/A/S events from the last 24h.
- Worth watching: high-score non-selected emerging events.
- Yesterday follow-up: selected events with meaningful 24h feedback changes.

Daily item shape:

- title.
- one-sentence conclusion.
- why it matters.
- quality score and selected label.
- source link.
- optional community feedback summary.

Weekly report sections:

- A/S events this week.
- Model, product, industry, and technique trends.
- Controversies and reversals.
- 5-10 items worth learning.
- 7d feedback updates for previous events.

Monthly report sections:

- S events this month.
- Key model/product/industry changes.
- Tools and techniques validated by usage.
- Controversy, failure, and hype signals.
- Long-term collectible topics.

## Public Agent Skill Integration

V1 should expose a public no-key Skill integration, not a full public API product.

Brand:

- AIWatch.

Skill name:

- aiwatch-hot.

Public install page:

- `/aiwatch-skill/`

Skill file:

- `/aiwatch-skill/SKILL.md`

Trigger words:

- AIWatch.
- AI 热点.
- AI 日报.
- AI 精选.
- AI 动态.

Public read endpoints:

- `GET /api/public/items`
- `GET /api/public/daily`
- `GET /api/public/daily/{date}`
- `GET /api/public/dailies`
- `GET /aiwatch-skill/SKILL.md`

No API key is required for public read endpoints.

Protection:

- IP rate limits.
- User-Agent logging.
- pagination and limit caps.
- 30-120 second cache.
- no full-history bulk pulls.

Authenticated areas:

- admin.
- source moderation.
- like.
- star.
- comment.
- expert scoring.

Skill routing rules:

- Broad questions such as "今天 AI 圈有什么" use `GET /api/public/items?mode=selected&since=<semantic_window>`.
- Daily report requests use `GET /api/public/daily` or `GET /api/public/daily/{date}`.
- Explicit "全部 / 完整 / 所有 / 全量" requests use `GET /api/public/items?mode=all`.
- Category questions use `GET /api/public/items?mode=selected&category=...`.
- Keyword questions use `GET /api/public/items?q=...`.
- Daily discovery uses `GET /api/public/dailies?take=N`.

Search should run server-side. Agents should not fetch a large list and grep locally.

Example item response:

```json
{
  "id": "evt_...",
  "title": "...",
  "url": "...",
  "source_name": "OpenAI Blog",
  "author_name": "OpenAI",
  "author_handle": "@OpenAI",
  "summary": "...",
  "recommendation_reason": "...",
  "quality_score": 88,
  "selected_level": "B",
  "selected_label": "当日精选",
  "category": "模型",
  "tags": ["OpenAI", "API", "模型"],
  "published_at": "...",
  "promoted_at": "...",
  "media": []
}
```

Skill output principles:

- Default to Chinese.
- Start with 3-5 most important events.
- Include source links.
- Say that original sources are authoritative because summaries are LLM-generated.
- Return longer lists only when the user asks for all/full results.

## Search

V1 search prioritizes events.

Search priority:

1. Event title.
2. Event summary.
3. Tags, company, model, product, person.
4. Main source name.
5. Associated post titles.
6. Associated post snippets.

Results are event-grouped to avoid repeated posts for the same event.

V1 can use keyword search, tags, time windows, and selected-level filters. Vector search is deferred.

## UI Content Card

Each event card includes:

- author/publisher name and avatar.
- social handle or source name.
- selected status.
- quality score.
- title.
- original link.
- summary.
- recommendation reason.
- media: video first, then images, otherwise text-only.
- tags.
- source credibility note.
- user like, star, and comments.

Content summary answers:

- What happened?

Recommendation reason answers:

- Why should the user care?

## Community Contribution Model

AIWatch should be maintainable by the community, but public contributions must never go live automatically.

Accepted contribution types:

- recommended sources.
- source metadata fixes.
- category or tag suggestions.
- event merge or association suggestions.
- correction reports for wrong summaries, wrong main sources, or duplicate events.
- documentation and self-hosting improvements.

Contribution states:

- submitted.
- triaged.
- approved.
- rejected.
- applied.

Public users can submit suggestions, but only selected authors, moderators, or admins can approve and publish them.

Every contribution should store:

- contributor account or anonymous fingerprint.
- target object type: source, event, post, report, config, documentation.
- proposed change.
- reason.
- reviewer.
- review status.
- review note.
- created_at.
- reviewed_at.

GitHub contributions are welcome, but repository changes should follow the same rule:

- Pull requests can update public code, documentation, source seed files, or example configuration.
- Pull requests must not include real API keys, cookies, access tokens, private crawler credentials, or production database dumps.
- Data changes that affect the live site still require backend review before production import.

## Admin Console

The project needs a private admin console for operation and moderation. It must not be shown in the public site navigation.

Admin console users:

- owner: full system access.
- admin: source, event, report, user, and settings maintenance.
- selected author: source review, expert scoring, B-level direct-push, event correction.
- moderator: comments, contribution review, duplicate reports.
- readonly operator: monitoring only.

Admin console capabilities:

- monitor crawler health, queue status, failed jobs, and API errors.
- approve, pause, remove, and edit sources.
- review community source recommendations.
- inspect posts before or after event creation.
- correct event merges, associations, and main source selection.
- review scoring breakdowns and promotion history.
- approve expert direct-push actions.
- manage daily, weekly, and monthly reports.
- moderate comments.
- inspect audit logs.
- manage public Skill endpoint health.

Security expectations:

- Admin routes are not linked from the public UI.
- Admin access requires login.
- Production owner account is created through a controlled setup flow, not hardcoded into the repository.
- Sensitive admin actions require audit logging.
- V1 can use simple role-based access control; fine-grained enterprise permissions are deferred.

## Open Source And Self-Hosting

AIWatch should be downloadable and self-hostable.

The public repository may include:

- application source code.
- database migrations.
- public documentation.
- the product spec.
- seed examples for sources.
- example environment files such as `.env.example`.
- local development setup instructions.
- public Skill template.

The public repository must not include:

- real API keys.
- OAuth secrets.
- cookies.
- session secrets.
- production database URLs.
- production crawler credentials.
- private source lists that should not be public.
- user data exports.
- production logs containing personal or secret data.

Configuration rules:

- All secrets must come from environment variables or a local ignored config file.
- The repository should include `.env.example`, not `.env`.
- Local installation should work with mock/sample data when no paid crawler/API credentials are configured.
- Optional integrations such as X, Zhihu, Reddit, and GitHub should fail closed with clear setup messages when credentials are missing.
- The hosted public service and self-hosted instances should use the same codebase, but different runtime configuration.

Self-hosting success criteria:

- A new maintainer can clone the repository.
- They can install dependencies.
- They can run migrations.
- They can start the web app locally.
- They can load sample sources/events without private credentials.
- They can configure their own API keys locally without committing them.

## Audit Requirements

Audit logs are required for:

- source create, approve, update, pause, remove.
- source level or category changes.
- main source correction.
- expert direct-push to B.
- expert weighted like/star.
- manual promotion override.
- community contribution review and application.
- admin role changes.
- report publish, unpublish, or correction.
- secret-related configuration checks, without storing secret values.

Audit fields:

- action.
- actor_id.
- target_id.
- before.
- after.
- reason.
- created_at.

## Success Criteria

V1 is successful when:

- Users can browse all AI dynamics in time order.
- Users can see scarce selected events across B/A/S levels.
- Users can understand why an event is selected.
- Selected events are based on deterministic formulas, not opaque LLM judgment.
- Source directory is public, clickable, and explainable.
- Admins can approve and maintain sources.
- Community users can suggest sources or corrections, but changes require review before going live.
- A private admin console can monitor crawling, moderation, scoring, reports, and audit logs.
- Experts can direct-push B with audit logs.
- Daily report is generated from events at 08:00.
- AIWatch Skill can be installed by agents and fetch selected items without an API key.
- Old selected events retain their selected identity but naturally fall in ranking unless new signals arrive.
- The repository can be shared publicly without real API keys or private production configuration.
- The project can be self-hosted with sample data and local environment configuration.

## Resolved Implementation Decisions

Resolved in a design grilling session on 2026-05-23. These supersede the previously open list. Decisions are recorded in dependency order.

### 1. Runtime and package manager

- Bun is required for install, dev, and CI. `bun.lock` is the only lockfile; `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` are banned from commits.
- `packageManager: "bun@x.y.z"` pinned. Commands: `bun install`, `bun run dev`, `bun run build`, CI `bun install --frozen-lockfile`.
- Recommended runtime Bun; compatible runtime Node.js. Node compatibility applies to runtime code only, never to dependency installation. Non-Docker self-host must install Bun first; Docker images ship Bun.

### 2. Application topology

- Next.js web app plus a separate Bun worker, one repo, two process types.
- Web (Node-compatible runtime) serves the reader site (SSR/SEO), the admin console (unlinked route group, authenticated), and `/api/public/*` read endpoints.
- Worker (Bun) runs crawling, scoring, promotion, and the 08:00 report cron.

### 3. Database

- PostgreSQL everywhere (hosted and self-host), one engine.
- DB-as-queue via `SKIP LOCKED`, so no Redis in V1.
- Full-text search via `tsvector` + GIN now; `pgvector` later with no migration. Self-host via `docker compose`.

### 4. Data access and migrations

- Drizzle ORM + drizzle-kit. One shared TypeScript schema for web and worker. Migrations: `bun run db:generate` / `bun run db:migrate`.
- CRUD via the Drizzle query builder; complex scoring / promotion / queue-lock / search may use raw SQL, confined to `db/queries` and `db/jobs`, never scattered in business code.
- Drizzle's role is a unified boundary for schema, types, simple queries, and migrations, not to hide SQL. Scoring and promotion are expressed as plain, clear SQL.

### 5. Worker job runner

- graphile-worker. Queue lives in the `graphile_worker` schema (library-owned); `public.*` is Drizzle-owned.
- Scheduling: coarse cron enqueues DB-selected source jobs (not 120 per-source crontab lines). Dedup via `jobKey = crawl-source:{sourceId}:{timeBucket}`.
- Risk: validate under Bun on day 1. Fallback: hand-rolled Drizzle + `SKIP LOCKED`, only if graphile-worker fails under Bun.

### 6. LLM and deterministic boundary (Strict)

- LLM owns, as immutable inputs only: ai_relevance, impact, novelty, audience_usefulness prediction, evidence_clarity; category/tags/summary/title/recommendation_reason; merge candidate; comment classification.
- Code owns, deterministic SQL: source score, external heat, real user score (Wilson/Bayesian over likes/stars/saves/clicks), expert score (real certified-expert actions only), citation and comment quality aggregates, base/promotion/rank scores, time decay, B/A/S promotion, follow-up schedule.
- `audience_usefulness_score` is the LLM cold-start prediction, never real feedback. `expert_value_score` comes only from real expert actions; the LLM may not impersonate an expert.
- Principle: LLM judgments are immutable inputs; deterministic SQL computes all derived scores. Re-tuning a weight is a SQL re-run, never a re-inference.

### 7. Scoring engine home

- Config-as-code, version-stamped. `scoring/config.ts` (typed, git-reviewed, explicit `scoring_config_version`) holds base/promotion/rank weights, B/A/S thresholds, slot limits, decay params, expert/user weight rules, follow-up rules.
- Change flow: PR, review, version bump, deploy, graphile-worker recompute backfill (SQL-only, no LLM).
- Every computed score stores `scoring_config_version`, `prompt_version`, `model_id`, `computed_at`, and a score-breakdown snapshot.
- Admin may preview/dry-run a draft config but cannot publish; going live requires draft, PR, review, deploy.

### 8. Source acquisition

- Pluggable connectors: `SourceConnector { fetch(source): Promise<RawPost[]> }`. Adapters: rss, github, hn, youtube_rss, huggingface, reddit, rsshub, mock. All normalize to `RawPost[]`. MockConnector serves sample data offline.
- Posture: RSS-first plus official APIs plus optional RSSHub. Hard tier (X, Zhihu, Bilibili, Weibo) via RSSHubConnector, fail-closed; X official API is an optional paid fallback; third-party scrapers deferred.
- Principle: Source is data (DB rows, admin-managed CRUD plus enable/disable, level, frequency, health). Connector is code. Subscription controls whether a source is active.
- Soft-delete by default (archive); physical delete only if a source never crawled successfully and has no posts/events referencing it.
- Product rule: hard-tier failure reduces coverage, not system availability.

### 9. Crawl governance

- Layered: connector caps in code/config; per-source frequency/enabled/health in DB; tokens and budget caps in env.
- Source circuit-breaker: 5 consecutive failures degrade and double the interval; 20 consecutive auto-disable plus admin flag.
- Connector-wide failure pauses that connector 15-60 minutes and does not mass-disable its sources.
- Unified spend_guard (X API plus LLM): 80% warns and sheds optional work (deep citation/comment follow-ups first); 100% fails closed paid connectors and non-critical LLM, with raw posts left pending.

### 10. Auth and RBAC

- better-auth. One `users` table for public engagement, experts, and the console. Local email/password first; OAuth optional; no managed provider required for self-host.
- DB-backed revocable sessions; httpOnly secure cookies.
- RBAC roles: user, expert, moderator, selected_author, admin, owner, readonly_operator. Capability map lives in code; `expert_domain` and `expert_weight` are app fields. Console is an unlinked route group, moderator+ for writes, readonly inspect-only, sensitive actions audited.
- Owner bootstrap via setup command or one-time env token; no hardcoded admin.
- Day-1 spike under Bun + Next.js + Drizzle/Postgres; downgrade to roll-your-own minimal auth (not Auth.js) only on architecture mismatch.

### 11. LLM provider routing

- Task-level model routing, config-driven, env-keyed, fail-closed. One `LLMProvider.structuredGenerate<T>` interface.
- Providers: OpenAI, Anthropic, Google, DeepSeek, Qwen, and OpenAI-compatible via custom `baseUrl` (Ollama, vLLM, LM Studio, SiliconFlow, OpenRouter, DashScope).
- Per-layer config (prefilter, cold_judge, comment_classification, merge_detection, s_level_review): provider, model, promptVersion, maxInputTokens, maxOutputTokens, temperature.
- Keys from env only. Missing key fails closed for that route only. Judgments stamp provider, model_id, prompt_version, routing_config_version, computed_at.
- Structured output enforced, validated, clamped, with one retry; malformed marks the post `judge_failed`, never silently defaulted. A $0 deterministic gate runs before the cheap prefilter model. Docs warn about third-party proxies (model substitution, data leakage, opaque billing).

### 12. Event formation pipeline (event-level judgment)

- The Event is the scoring/ranking/promotion object; the Post is raw source material.
- Pipeline: RawPost, $0 deterministic gate, cheap prefilter (sets initial_relevance_status), event resolution (deterministic merge on canonical URL / official release URL / GitHub repo+release tag / arXiv ID / Hugging Face model ID; LLM merge_detection for ambiguous cases: high merge, medium associate, low new event), strong cold_judge once per event, deterministic SQL scoring.
- Rejudge only on material new information (first official source, core-team detail, price/API/open-weight change, controversy or failed reproduction, comments/citations showing the judgment is stale). Duplicates and related posts enrich the event, not multiply LLM cost.

### 13. Public API and Skill

- Read-only, no key: `/api/public/{items,daily,daily/:date,dailies}` and `/aiwatch-skill/SKILL.md`. Cursor pagination, hard page-size and depth caps, no bulk export.
- Defense: CDN/HTTP cache is primary (per-endpoint `s-maxage` 30s-3600s, `stale-while-revalidate` where safe); per-IP in-memory token bucket for abuse control (per-instance, abuse-grade). No Redis; it may re-enter only if public abuse becomes a real production problem.
- Observability: user-agent logging, latency/error counters, admin Skill-health view.
- `SKILL.md` is static or quasi-static: it teaches the agent how to call the API and never embeds feed data, so fetching the Skill cannot become an implicit data export.

### 14. Contribution flow

- Two-track by target. DB is live truth; git seed files are bootstrap-only; no dual-write path for live sources.
- In-app: source recommendations, metadata fixes, tag/category suggestions, merge/association suggestions, correction reports. Reviewed in the admin console; on `applied`, writes the DB target plus an audit-log row. States: submitted, triaged, approved/rejected, applied.
- GitHub: code, docs, seed files, example config, scoring config, prompt config. Reviewed by PR.
- Permissions: public submit, moderators triage, selected-authors/admins approve, only admin/owner applies sensitive changes (source level, expert weight, scoring config).

### 15. Data-sharing policy and seed/install

- Hosted AIWatch data (sources, events, posts, judgments, scores, reports) is proprietary operational data: not published as repo seed, no full export.
- The repo ships code, schema/migrations, docs, and mock/demo fixtures only. Self-hosters configure their own sources, credentials, and LLM providers. DB is live truth per deployment.
- `bun run db:seed:demo` seeds 3-5 mock sources, 5-10 mock posts/events, pre-baked fake judgments, and one sample daily report. `bun run db:seed:empty-owner` bootstraps the owner. `docs/examples/sources.example.json` is a format example only. There is no `seed:sources` that imports a real or semi-real source library.
- Install: `bun install`, `bun run db:migrate`, `bun run db:seed:demo`, `bun run dev`; or `docker compose up` (Postgres + web + worker) as the primary self-host path.

## Open Implementation Decisions

Remaining open items are operational or build-time, not architectural:

- Initial curated 80-120 source list. This is an operational asset, maintained in the production DB, and intentionally not distributed in the public repo.
- Final exact numeric values (fetch frequencies, connector concurrency caps, inbound rate limits, budget thresholds). Start from the defaults proposed during the design session and tune during the build.

## Build & Delivery Decisions

Resolved in the build-planning grill on 2026-05-23, covering how the project is created from this spec. Recorded A-H in dependency order.

### A. Build order: thin vertical slice first

- Walking skeleton, not layer-by-layer. The biggest risk is spine integration (Bun worker -> Postgres -> LLM judgment -> deterministic scoring -> web render), so prove one end-to-end line before widening.
- Slice 0 goal: one source, one crawl, one event, one judgment, one deterministic score, one reader card, one admin health view.
- Slice 0 chain: repo+Bun+Next+worker scaffold; Postgres+Drizzle migrations; graphile-worker runs a crawl-source job; RSS/Mock connector fetches 1 RawPost; $0 gate + canonical-URL dedup; create 1 Event; cold_judge (real or stub) writes a versioned judgment; deterministic base_score writes a score snapshot; reader homepage renders the event card; better-auth login (minimal); admin shows source health.
- Auth in Slice 0 is minimal: create owner, login, protect /_admin, view source health. No full RBAC, contributions, expert weights, public Skill, reports, or B/A/S promotion in Slice 0.

### B. Repo structure: single package, one dependency tree

- One `package.json`, one `bun install`. Next.js app under `src/app`, Bun worker under `worker/`, shared framework-agnostic modules under `src/` (`db`, `scoring`, `llm`, `connectors`, `core`, `auth`).
- No workspaces in V1 (KISS/YAGNI; promote later if needed).
- Import boundaries (lint-enforced later): `worker/**` cannot import `src/app/**`; `src/app/**` cannot import `worker/**`; `src/{db,scoring,llm,connectors,core,auth}/**` cannot import `next`/`react`.
- `/_admin` is a real path (real directory); `(reader)` is a route group (not in URL).

### C. Slice 0 DB schema

- Tables: `sources`, `posts`, `events`, `event_posts`, `event_judgments`, `event_scores`, plus minimal better-auth/user tables, plus library-owned `graphile_worker.*`.
- `event_judgments` and `event_scores` are append-only/immutable. `events` holds `current_judgment_id` / `current_score_id` pointers plus denormalized hot fields for fast reads/sort.
- IDs are prefixed ULIDs stored as `text` (`evt_...`, `src_...`). Timestamps are `timestamptz` stored UTC. Stable categories use `pgEnum`. LLM dimension scores are independent `smallint` columns.
- `posts`: no global unique on `canonical_url`; use `unique(source_id, canonical_url)` + `idx(canonical_url)` + `content_hash` index. Global dedup happens via event resolution, not by rejecting post inserts.
- `main_source_id` is derived from `main_post_id` and only updated by jobs.
- `event_judgments` carries `trigger_reason` (initial/official_update/major_correction/new_evidence/manual_rejudge) and optional `trigger_post_id`.
- `event_scores` carries `scoring_config_version`, `judgment_id`, `breakdown` jsonb, and `display_score`.
- Deferred until later slices: `contributions`, `audit_logs`, `comments`, `reports`, `reference_source_sets`, spend/usage tracking, FTS.

### D. Scoring v1 (Slice 0)

- Config-as-code in `src/scoring/config.ts`, `scoring_config_version = "scoring-v1"`. Slice 0 implements deterministic `base_score` only.
- `base_score = source*0.20 + ai_relevance*0.15 + impact*0.20 + novelty*0.10 + external_heat*0.15 + audience_usefulness*0.10 + expert_value*0.10`. All inputs normalized 0-100; weights sum to 1.
- `source_score` from level: L1=100, L2=85, L3=70, L4=55, L5=40 (blend with `source_quality_score` deferred).
- `external_heat_score` = `clamp(100 * log1p(heat_raw) / log1p(platform_saturation), 0, 100)`, per-platform saturation; unknown platform -> default saturation; missing metrics -> heat_raw=0.
- LLM dimensions are direct 0-100 inputs. Cold start: `user_value` = LLM `audience_usefulness_score`; `expert_value` = neutral 50 (0=expert negative, 50=no signal, 100=expert strong positive).
- Slice 0: `quality_score = base_score = rank_score`; `display_score = round(base_score)`. Decay uses `last_strong_signal_at` (not `published_at`). Per-event base_score is TS (unit golden tests); bulk recompute + promotion tournament are raw SQL in `db/jobs` (later slices).
- Deferred (proposed defaults only, calibrate with real data): grade floors B75/A86/S94; decay half-lives B3d/A10d/S30d; freshness half-life 2d; slot limits B20/day, A12/week, S5/month; user signal Wilson-vs-Bayesian depends on whether exposures/clicks are tracked.

### E. Time and timezone

- All timestamps stored as `timestamptz` UTC. `APP_TZ` defaults to `Asia/Shanghai`, env-configurable; used for reports, UI display defaults, and semantic date parsing. Never depend on server local timezone.
- Daily report cron means 08:00 in `APP_TZ`. If graphile-worker crontab supports timezones, set it explicitly; otherwise set worker `TZ=APP_TZ` and document it.
- Feed/items semantic windows are rolling (today=24h, week=7d, month=30d). Reports are calendar-keyed: `/api/public/daily/{date}` uses `YYYY-MM-DD` in the `APP_TZ` calendar; `/daily` is the latest generated report.
- Semantic windows are resolved server-side; clients/Skill never compute date boundaries. Reader UI displays time in `APP_TZ`; user-locale personalization deferred.

### F. Hosted deployment shape

- Containerized web + single Bun worker + managed Postgres + CDN. Same repo, same image family, same env model; self-host docker-compose stays structurally similar.
- web: stateless, horizontally scalable, in-memory IP limiter remains per-instance approximate. worker: V1 single instance, owns cron scheduling.
- CDN respects `Cache-Control` `s-maxage`/`stale-while-revalidate`; admin routes bypass cache.
- Vercel split deferred (would orphan the long-running worker across two platforms). Single-VPS all-in-one is not the default (managed Postgres backups/PITR preferred).
- Preferred shape: Fly.io / Railway / Render / container-capable VPS + managed Postgres + CDN. Vendor, ICP, and mainland-China access/CDN decided at deploy time without changing the topology.

### G. Language strategy

- Chinese-first, i18n-ready. V1 ships only Chinese UI but all UI strings go through a message catalog (`src/i18n/messages/zh.ts`); `UI_LOCALE` defaults to `zh` and is configurable.
- Original source content preserved (`raw_title`, `raw_content`, source URL). Generated display fields (`display_title`, `summary`, `recommendation_reason`) default to `CONTENT_LANG` = `zh`. No full-article translation in V1.
- `category` defaults to Chinese; `tags` may be mixed (proper nouns preserved, Chinese topic tags allowed).
- Scoring is language-independent: language never directly boosts or penalizes a score; English and Chinese sources use the same dimensions; the LLM judges signal quality, not language.
- Chinese full-text search requires an explicit decision at the search slice (default Postgres `tsvector` does not tokenize Chinese): choose among simple+trigram, zhparser/pg_jieba, PGroonga, or external search.

### H. Test strategy

- `bun test` for unit + DB-integration; Playwright for E2E. No Vitest/jsdom/component-test stack in V1.
- DB integration runs against a real temporary Postgres (CI service or Testcontainers): apply Drizzle migrations, insert fixtures, run jobs/queries, assert rows + scores + provenance. Mocking the DB would not test the SQL core.
- LLM: CI uses `StubLLMProvider` with deterministic fixtures; real-provider tests are behind an env flag and not required for CI pass. Connectors: `MockConnector` for skeleton/demo, recorded HTTP fixtures for real adapters; no live network in CI.
- Coverage: 80% global floor as the gate once the harness stabilizes; scoring/gate/dedup/promotion/governance should be near-exhaustive; UI uses E2E smoke for critical flows, not jsdom markup tests.
- Tests-first (strict): base_score, external_heat_score, $0 gate, canonical/content-hash dedup, append-only judgment/score behavior, promotion (later). Test-after/E2E acceptable for: repo scaffold, simple page rendering, route wiring, admin shell.
- `graphile-worker executes crawl job` lives in an `integration:worker` group so it does not block the fast unit suite, but CI still runs it.
