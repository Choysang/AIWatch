# Agent Run Changelog

## 2026-06-12（第二轮：连通性验证 + 痕迹清理收尾 + 文档 + 发布）

- 新增 `scripts/audit-source-health.ts`（`bun run sources:audit`）：批量拉取严选池所有 feed，输出 `data/sources/source_connectivity_report.csv`（status/parseable/item 数/最新条目日期/verdict）。
- 连通性复核剔除 3 个渠道死源：LangChain Blog（RSS 已下线返回 HTML）、LlamaIndex Blog（官方 feed 404，Medium 镜像停更于 2024）、Qdrant Blog（feed 触发 XML 实体膨胀保护）；对应 X 官号仍在池内，覆盖不丢。修正 Google DeepMind Blog feed URL。核心池 33 → 30。
- 本地数据库完成优胜劣汰：硬删除临时池导入且从未抓取的 218 行信源，curated 导入 + 池外归档后活跃源 = 30，痕迹 SQL 校验为 0。
- 新增文档：`agent_audit.md`、`competitive_research.md`、`source_selection_report.md`、`cleanup_bestblogs_trace.md`、`architecture.md`、`deployment.md`。
- 阅读端（上一轮已并入分支）：详情页原帖全文折叠 + 复制原文链接、卡片标题站内跳转、骨架屏、加载更多（URL limit 步进）、"最后更新"新鲜度提示、中文标题优先（deriveTitle CJK 判定）、提示词 v4（强制中文输出 + 严格扣分 + 术语表 + 反思自检）。

## 2026-06-12（第一轮：信源严选与默认精选）

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
