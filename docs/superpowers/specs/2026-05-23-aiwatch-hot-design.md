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

## Open Implementation Decisions

- Exact database choice.
- Exact crawler vendor/API choices for X, Zhihu, and CSDN.
- Exact web framework and job queue.
- Exact rate-limit values.
- Exact admin permission model.
- Initial 80-120 source list.
- Exact contribution review workflow in GitHub versus in-app backend.
- Exact local installation command and sample dataset format.

These decisions should be made during implementation planning, not expanded in this product spec.
