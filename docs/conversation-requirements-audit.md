# Conversation Requirements Audit

Last updated: 2026-07-01

This file tracks the user-requested AIWatch work across the long iteration thread. It is not
a marketing changelog; it is the working audit for what is shipped, what is blocked, and what
still needs product work.

## Shipped In Code

- Brand: reader-facing copy uses AIWatch; README and Skill describe AIWatch, not AI HOT.
- Theme: first visit follows system light/dark preference; manual choice persists.
- Cards: image previews preserve original aspect ratio and open in an in-page lightbox.
- Detail reading: summary/original/translation live on one page; original text can be fetched
  and translated in place.
- Rich content: extracted article content supports headings, links, images, code, tables, and
  safe image proxying.
- Timeline: feed rail shows time of day under day headings; old date duplication was removed.
- Mobile: sidebars and dense filters are collapsed into mobile controls; cards are denser.
- Sidebar: desktop nav groups content/access/more and can collapse groups.
- Feedback: admin annotations hide already-reviewed feed cards; public useless feedback folds a
  card and stores lower-weight preference signal.
- Preference learning: owner annotations affect source, category, content type, tag, and
  source-content-type scoring; latest scoring also penalizes personal self-promotion while
  preserving practical technical insight.
- Curation: official PR/customer case/marketing, low-value bottom-layer papers, pure car news,
  and repeated low-value source patterns are down-weighted; legal/regulatory AI news is lifted.
- Dynamic filters: category and source filters are generated from content that actually exists
  under the current query; source picker includes search and wider responsive layout.
- Feed stability: live refresh compares the visible feed `sort_at` before showing a new-item
  prompt, so historical backfills should not surface as fake new content.
- Hotspots: multi-source coverage feeds the hotspot ranking; repeated posts from one source do
  not inflate heat.
- Public API: `/api/public/items` includes permanent links, body, score/selection fields, and
  stable `sort_at`; `/api/public/hotspots` exposes current multi-source hotspots; daily APIs
  include station detail permalinks.
- RSS: public feeds point to station reader pages and support inline content where available.
- Skill: AIWatch Skill documents intent routing, hotspots, daily links, and one-time version
  self-check.
- Detail export/share: detail page has one-click share, standard `/events/{id}/markdown`
  download, browser Markdown/Obsidian/JSON/custom-template export, and full attribution.
- Admin: routing admin, source fault desk, annotation impact page, dashboard health signals,
  RSSHub/X/email alert visibility, and one-click source retest surfaces exist.
- Ops memory: recurring update checklist lives in `docs/iteration-memory.md`, including README
  sync, RSSHub/X checks, preference review, deployment tag checks, and source smoke testing.

## Production Tasks Completed On 2026-07-01

- Deployed `sha-959f0ac299befee1c6f7534c5dbeed31828d2a4f`, then deployed hotspot fix
  `sha-6723c07953f8a37e4bf4bcea49721726f0307399` to production.
- Ran Linux `scripts/pre-deploy-check.sh` on the server with pinned image tags.
- Re-imported curated sources with `--archive-non-curated`: total 107, updated 107,
  archived duplicate 1, archived non-curated 11.
- Disabled/archived the requested noisy sources and deleted their historical content:
  32 archived sources matched, 202 main events deleted, 230 raw posts deleted.
- Regenerated daily reports for 2026-07-01, 2026-06-30, and 2026-06-29 after deleting
  source content, so stored report snapshots no longer carry those removed source events.
- Recomputed production scoring and promotion after cleanup: rank scores, scoring-v2, and
  promotion-v2 all ran successfully.
- Smoke-tested production endpoints: homepage, selected/all feeds, `/api/public/items`,
  `/api/public/hotspots`, `/api/public/daily`, `/events/{id}/markdown`, and RSS.
- Fixed the current hotspot threshold so a two-source story after the first day no longer
  gets filtered into an empty list; `/api/public/hotspots` returned a live item after deploy.

## Production Follow-Up

- Production has `SOURCE_ALERT_EMAIL`, `TWITTER_AUTH_TOKEN`, and `RSSHUB_BASE_URL` set.
  `RESEND_API_KEY` is still missing, so email delivery for alerts cannot fire yet.
- RSSHub itself is running and many X routes return 200, but audit found 19 unhealthy X
  sources. Three permanent account errors were paused; 16 Twitter API 401 sources were marked
  degraded for admin review. These need route replacement or source-level decisions rather
  than another global token change.

## Still Product Backlog

- Same-source short-window carousel: the backend already folds same-event posts and detail pages
  show multi-source perspectives, but the feed card does not yet render a same-source similar-post
  carousel. This needs an explicit related-post projection for cards.
- Direct posting to domestic platforms: browser Web Share plus copy fallback is shipped. True
  one-click publish to WeChat/Zhihu/Douyin/Xiaohongshu is not generally available from a normal
  web page without each platform's private/native integration.
- Full AI assistant: the assistant is read-only and can answer from recent site context. It does
  not yet have page-aware citations across every view or admin write actions.
- Loop research: competitive research and UX/code review should remain continuous, not a one-time
  done item. Keep findings flowing into `docs/future_ideas.md` or issue-sized plans.
