# 临时信源池痕迹清理记录（2026-06-12）

背景：信源严选阶段曾把若干公开 OPML 订阅清单（含 bestblogs.dev 导出的全量清单）作为
**临时候选池**导入比对。这些清单只是行业公开的订阅源列表样本，不是本项目资产；
筛选完成后必须全部清理，最终项目只依赖自研的 `data/sources/curated_ai_sources.json`。

## 删除的文件

- `BestBlogs_RSS_ALL.opml`（临时候选池，400 源）
- `bestblogs_wechat2rss_opml_all.opml` / `bestblogs_podcast_opml_all.opml` / `bestblogs_youtube_opml_all.opml`（临时候选池，551 源；筛选记录已沉淀进 `source_audit_report.csv` 后删除）
- `scripts/import-bestblogs-sources.ts`（一次性导入脚本，已被自研 `scripts/import-curated-ai-sources.ts` 取代）

## 重命名/重写

- 导入脚本：`import-bestblogs-sources.ts` → `import-curated-ai-sources.ts`，逻辑重写：
  不再解析任何 OPML，只读取自研严选 JSON；幂等 upsert + 重复归并 + 池外软归档。
- package.json 脚本：`sources:import:bestblogs` → `sources:import:curated`。
- 信源 `recommendedBy` 字段统一为 `AIWatch`，`recommendReason` 全部自研撰写。

## 数据库清理

- 本地库：删除临时导入且从未被抓取过的 218 行信源（0 posts 关联，硬删除安全）；
  活跃池中 `connector_ref/url/recommend_reason` 不再含任何外部清单痕迹（SQL 校验为 0）。
- 审计 CSV 中候选来源列已脱敏为 `temporary_pool_ref_redacted` / `temporary_rss_pool`。

## 保留的通用逻辑及原因

- OPML/RSS 解析能力本身保留在 `src/connectors/rss.ts`（fast-xml-parser），这是 RSS 行业标准格式的通用解析，属于自研连接器的一部分，与任何外部项目无关。
- `scripts/import-xgo-sources.ts` 保留：解析的是通用 OPML/文本中的 X RSS 订阅地址，为历史导入工具，与外部清单项目无关。

## 校验结果

- 全仓库 `grep -ri "bestblogs|ginobefun"`：源代码/配置/文案/测试 0 命中
  （本清理记录与竞研文档按任务要求提及该名称，属于研究文档而非依赖）。
- 生产逻辑只读取 `data/sources/curated_ai_sources.json`，不存在对任何外部清单文件的引用。
