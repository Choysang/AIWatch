# Agent Run Changelog

## 2026-06-12

- Reframed the core source pool as a strict AI radar rather than a broad technology or business feed.
- Added `data/sources/curated_ai_sources.json` as the canonical curated source config.
- Added `data/sources/source_audit_report.csv` with explicit keep/drop reasons and new audit dimensions.
- Added `data/glossary/ai_terms_zh.json` for Chinese AI terminology consistency.
- Added `scripts/import-curated-ai-sources.ts` for idempotent curated source import, duplicate cleanup, and optional non-curated archival.
- Changed the public reader default query to selected mode; `mode=latest` still shows the full timeline.
- Updated the search bar so “精选” is the default state and “最新” is explicit URL state.
- Tightened light-judge prompt guidance against marketing, generic tech, and business noise.
- Added deep-extract glossary guidance and reflection checks for high-value content.
- Recorded intentionally deferred work in `docs/future_ideas.md`.

## Operational Notes

- Normal deploys must not reset the database. Source import performs upserts and soft archives only.
- Temporary raw source-pool files are not part of the final project state.
- After deployment, run curated import with `--archive-non-curated`, then run the last-week backfill.
