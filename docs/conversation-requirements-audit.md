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

## Data / Production Tasks Pending Server Access

- Deploy commit `1ac5ee74d1a56b7107d7e944a946a713e2ae6313` to production.
- Run Linux `scripts/pre-deploy-check.sh` on the server with the pinned image tag.
- Disable/archive the newly requested sources in production and delete their related posts/events:
  llama.cpp Releases, Simon Willison, Harrison Chase, Clement Delangue, swyx, Jerry Liu,
  Cloudflare Blog, hermes-desktop Releases, Hugging Face Blog, Artificial Intelligence News,
  Logan Kilpatrick.
- Re-import curated sources with archive-non-curated behavior after deployment.
- Recompute rank scores and run promotion check so new owner preference rules affect production.
- Smoke-test production endpoints: homepage, selected/all feeds, `/api/public/items`,
  `/api/public/hotspots`, `/api/public/daily`, `/events/{id}/markdown`, assistant, RSS.
- Confirm production SOURCE_ALERT_EMAIL/RESEND/AUTH_EMAIL_FROM and RSSHub/X token state.

Blocked reason: SSH auth currently rejects `root@8.219.61.189` with the provided password and
the local `aiwatch_deploy` key.

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
