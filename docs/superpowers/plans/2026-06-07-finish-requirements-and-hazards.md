# Finish Unfinished Requirements + Hazard Cleanup — Implementation Plan

- **Date:** 2026-06-07
- **Branch:** `feat/spend-guard-and-reader-polish`
- **Scope (user-locked 2026-06-07):** **Tier 1 + Tier 2 全做**; Golden Set = **确定性样本扩充**（不建真实 LLM 评测）。
- **Commit policy (user-locked):** 本地存放即可，本轮**不提交**。工作树已有大量未提交 WIP（pipeline 契约迁移已落地、api/v1、迁移 0018/0019），保持本地。
- **Pre-state verified 2026-06-07:** typecheck 干净 / `bun test src` 425 pass / `next build` 绿。迁移"半截"问题已不存在——pipeline 契约迁移已完整落地。
- **Run commands (Windows):** `$env:PATH = "C:\Users\CaiCaixin\.bun\bin;$env:PATH"; bun run typecheck` / `bun test src` / `bun run build`. 集成测试慢/偶发卡，按需。

## 现状基线（关键事实，post-compact 复用）

- Pipeline = **两级模型**：`light_judge`(全量) + `deep_extract`(仅T2)，路由在 `src/llm/routing.ts`。
- 分类 = **单轴 4 类** `INTELLIGENCE_CATEGORIES`（Core_Research/Dev_Stack/Product_Business/Practical_Build）在 `src/pipeline/judge-schema.ts`。
- `content_type` pgEnum（`src/db/schema.ts:45`）当前 4 值：`model_release/product_release/tech_share/discussion`；`categoryToContentType()` 做映射。
- Stage 7 出口：`/api/v1/brief`（`src/app/api/v1/brief/route.ts` → `listBriefItems` in `src/db/queries/brief.ts`）+ `/api/public/items`。**RSS 缺、MCP 缺**。
- `aiwatch-skill/SKILL.md` 只是静态文档，非 MCP server。
- `fast-xml-parser` 已是依赖（可用其 builder 生成 RSS）。
- `listBriefItems(query, db)` 返回 `BriefItem[]`，支持 category/tier/since/sort/take，take 上限 100。
- 公共运行时工具：`src/app/api/public/_runtime.ts` 导出 `clientIp`/`publicLimiter`/`jsonError`/`cacheControl`。
- 索引齐全（events_published/selected/rank/pipeline_tier/fold/content_type…）；**唯一性能隐患=搜索全表扫**。

---

## TIER 1 — 明确低风险（无需决策，直接做）

### T1.1 搜索索引隐患（migration 0020）
- `searchEvents`（`src/db/queries/feed.ts`）用 `ILIKE '%q%'` 扫 ~25 字段（含 join 的 `posts.raw_content`），前导通配符=全表顺扫。
- **修复**：新迁移 `0020_search_trgm.sql`：
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - GIN trigram 索引（`gin_trgm_ops`）覆盖高频扫描列：`events.title`、`events.summary`、`events.recommendation_reason`、`posts.raw_content`、`posts.display_title`、`posts.raw_title`、`sources.name`。
  - 同步在 `src/db/schema.ts` 加 drizzle index 声明（`.using('gin', sql\`... gin_trgm_ops\`)`），并 `bun run db:generate` 校验或手写 SQL + 更新 `_journal.json`。
- 验证：`bun test src` 不回归；（有 DB 时）`EXPLAIN` 确认走 bitmap index scan。
- ⚠️ embedded-postgres 需含 pg_trgm（contrib 一般自带）；若集成测试环境无该扩展，迁移用 `IF NOT EXISTS` 容错，并在测试 helper 里确保扩展存在。

### T1.2 Stage 7 — 净化版 RSS
- 新 `src/app/api/v1/rss/route.ts`（`export const dynamic = "force-dynamic"`）。
- 复用 `listBriefItems`（默认排序，take~50，可选 `?category=&since=`）。
- 用 `fast-xml-parser` 的 `XMLBuilder` 生成 RSS 2.0：channel(title/link/description/lastBuildDate) + item(title/link/guid/pubDate/description=one_line 或 detailed)。**只输出事实摘要，无原文整句**（版权）。
- Headers：`content-type: application/rss+xml; charset=utf-8` + `cache-control`（复用 `cacheControl`）。限流走 `publicLimiter`/`clientIp`。
- 单测：构造 BriefItem 数组 → 断言 XML 含 item、转义正确、无 gold_quote 字段。

### T1.3 Stage 7 — MCP Server
- 新 `mcp/index.ts`（stdio MCP server）。依赖 `@modelcontextprotocol/sdk`（需 `bun add`）。
- 工具：
  - `search_brief({ category?, tier?, since?, sort?, query?, take? })` → 包 `listBriefItems`（query 用内存过滤或扩展查询）。
  - `get_latest({ take? })` → 最新 N 条。
- `package.json` 加 script `"mcp": "bun run mcp/index.ts"`。
- 文档：在 `aiwatch-skill` 或 README 增 Cursor/Claude 接入片段（command+args）。
- DB 访问复用 `src/db/client.ts`（lazy proxy，导入不连库）。
- 验证：typecheck；可选手动 `echo '{...initialize...}' | bun run mcp/index.ts`。
- 注意：MCP server 是独立进程入口，勿被 `next build` 牵连；放 `mcp/` 顶层，确保 tsconfig include 但不进 app bundle。

### T1.4 Golden Set 扩充（确定性）
- 扩 `src/pipeline/golden-set.test.ts`：现仅 3 样本 + 1 prompt 检查。
- 新增（测 `gateLightJudge` + `lightJudgeSchema`）：
  - 硬负例：像干货的软文/课程推广 → Trash（tier null）。
  - 安静正例：纯文字洞察、无链接无热词 → score≥80 → T2。
  - 各类目边界：每个有效类目一条 60–79（T1）与一条 ≥80（T2）。
  - [78,82] 缓冲带样本（79→T1, 80→T2 的边界确认）。
- prompt 契约检查：triage/deep 两 prompt 含"无链接不影响打分""深度字段不在轻量生成""禁止逐句引用"。
- 注意：双轴落地后（T2.x）需同步把 golden set 切到含 domain 的新 schema。

---

## TIER 2 — 双轴分类法 + 单模型重构（contract migration · 决策已锁 · 未实施）

来源：`docs/superpowers/specs/2026-06-06-summarization-engine-and-taxonomy-design.md`。

### §9 决策（用户 2026-06-07 已锁）
1. **(a)** 领域 `科研·论文` 仅收不绑定具体产品/模型的纯研究机构产出，其余论文走 `大模型/框架×研究`。
2. 领域 **单选**（MVP）。
3. 单模型 = **deepseek-chat**（triage + 深抽同一模型）。
4. content_type 回填 = **脚本映射 + 抽样人工校正**。

### 关键实现决策（本轮新探明，降churn）
- **用英文 enum ID，中文走 i18n**（与现有 action_class、category 一致，避开中文 enum 编码/迁移坑）。
- **领域轴复用现有 `events.category`（text 列，非 enum）**：不新增 domain 列，直接把 category 的取值从旧 4 类 `INTELLIGENCE_CATEGORIES` 换成 6 领域。`EVENT_CATEGORIES`(public/query) 同步 4→6。event_judgments.category 同为 text。
  - 6 领域 ID：`large_model`/`framework_tools`/`product_app`/`industry_biz`/`research_paper`/`safety_align`。
- **content_type enum 4→5（破坏性重建，真正的工作量）**：新 5 值英文 ID `release`/`research`/`howto`/`opinion`/`news`。
  - Postgres enum 非 1:1 不能 RENAME；migration 0021 走重建：建新 enum → 列改类型(USING 映射) → 删旧 enum。
  - 旧→新映射：`model_release→release`、`product_release→release`、`tech_share→howto`、`discussion→opinion`；`research`/`news` 旧表无来源，回填脚本按标题/来源二判 + 抽样人工。

### 爆炸半径（~20 文件 + 迁移 + 回填 + ~8 测试）
- `src/pipeline/judge-schema.ts`：INTELLIGENCE_CATEGORIES→6 领域；CONTENT_TYPES 4→5；categoryToContentType 重写；gate 不变。
- `src/pipeline/prompts.ts`：triage prompt 输出 `{score,domain,content_type,one_line_summary,fold:{primary_entity}}`；deep prompt 不变(已无金句)。版本号 bump。
- `src/llm/routing.ts`：light/deep 退化为单模型默认 deepseek-chat（保留 env 覆盖 + fail-closed）。
- `src/db/schema.ts`：contentTypeEnum 改 5 值；category 注释更新。
- `src/db/migrations/0021_dual_axis.sql` + journal：content_type enum 重建 + category 值迁移。
- `scripts/backfill-domain-content-type.ts`：回填 category(域)+content_type(类型)。
- `src/scoring/config.ts`：`contentTypeSelectionMultiplier` 重键到 5 值（release 1.05 / opinion 0.9 / 其余 1.0）。
- `src/scoring/selection-score.ts`、`compose-v2.ts`：随类型变化，逻辑同构（按 Record 取值）。
- `src/public/query.ts`：EVENT_CATEGORIES→6 域；content_type facet 值 4→5。
- reader：`search-bar.tsx`(域 Tab+类型 chip)、`event-card.tsx`、`i18n/messages/zh.ts`(域+类型标签)、`page.tsx`。
- `src/pipeline/process-source.ts`：judgment 组装用新 domain+content_type。
- 测试更新：`judge-schema.test`、`golden-set.test`、`compose-v2.test`、`selection-score.test`、`timeline-tree.test`、`tests/integration/public-items.test`、`pipeline.test`、`public/query.test`。
- 低触点（仅读/透传）：`public/item.ts`、`event-detail.ts`、`media.ts`、`inline-comments.tsx`、`comment-ticker.tsx`、brief/rss routes(EVENT_CATEGORIES 自动跟随)。

### 执行顺序（保持每步可编译）
1. judge-schema 契约（域+类型常量、map、类型）→ 2. scoring config/selection 重键 → 3. prompts + routing 单模型 → 4. schema enum + migration 0021 + 回填脚本 → 5. public/query + feed 过滤 → 6. reader UI + i18n → 7. 全测试修复 → 8. typecheck/test/build/integration 全绿。

> ⚠️ 破坏性 enum 迁移 + 撞未提交 WIP。建议在干净上下文的专门会话里执行（计划已可直接照做），避免高成本会话里边迁边错。

### T2.1 分类契约（双轴）— `src/pipeline/judge-schema.ts`
- 领域轴 enum（6）：大模型 / 框架·工具 / 产品·应用 / 行业·商业 / 科研·论文 / 安全·对齐。
- 内容类型轴（5，取代旧 4）：发布 release / 研究 paper / 教程实操 howto / 观点讨论 opinion / 行业动态 news。
- triage schema：`{ score, domain, content_type, one_line_summary, fold:{primary_entity} }`（action_class 改由 content_type 承担折叠键，或保留 primary_entity+content_type）。
- `gateLightJudge` 分数门（<60/60-79/≥80）不变。
- `buildFoldKey = normalize(primary_entity)+"|"+content_type`。

### T2.2 单模型重构 — `src/llm/routing.ts`
- 退化为**单模型两 prompt**：light/deep 用同一 provider+model，仅 prompt 不同（移除"两级 provider"语义）。
- 保留 fail-closed（无 key → null → judge_failed no_key）。

### T2.3 Prompt 契约 — `src/pipeline/prompts.ts`
- triage prompt（全量）+ deep prompt（仅T2，禁止逐句引用）。各带 version 常量，改动过 Golden Set 闸。

### T2.4 数据模型 — schema + migration 0021 + 回填
- `events` + `event_judgments` 加 `domain` enum 列。
- `content_type` 取值切换到新 5 值：**Postgres enum 改值是痛点**（不能直接删值）。方案：建新 enum `content_type_v2`（5 值）→ 加新列/或 `ALTER TYPE ... RENAME` + 重建 + 数据迁移。计划用：新增 `domain` 列 + 新 enum 列 `content_type` 迁移（旧值映射）。
  - 旧→新映射（非 1:1，回填脚本 `scripts/backfill-domain-content-type.ts`）：`model_release→发布`、`product_release→发布`、`tech_share→（按标题/来源二判：教程实操/观点讨论/研究）`、`discussion→观点讨论`；`研究`/`行业动态` 旧表无直接来源，按标题/来源二次判定。
- reader 读取 `events.content_type`/`domain` 的所有点（feed.ts/public query/UI facet）同步。

### T2.5 Reader 双轴筛选
- 筛选 facet 从单轴改双轴（领域 Tab + 类型 chip）。涉及 `src/public/query.ts`、`src/app/(reader)/*`、`searchEvents` 过滤条件。

### T2.6 Golden Set 切双轴
- 样本加 domain，断言双轴在边界样本稳定。

---

## 验证（每个 Tier 结束都跑）
1. `bun run typecheck`
2. `bun test src`（含新 RSS/golden/MCP 单测）
3. `bun run build`
4. （有 DB）`bun test tests/integration`
5. 手动：curl `/api/v1/rss` 看 XML；MCP `initialize` 握手。

## 验收
- Stage 7 三视图齐：API ✓ + RSS ✓ + MCP ✓。
- 搜索走索引（trgm GIN）。
- Golden Set 含硬负例/安静正例/边界/缓冲带。
- 双轴分类落地，T1 只出标题+一句，T2 出详细+2-3观点+tags，无逐句引用。
- typecheck/单测/build 全绿。

## Post-compact resume
读本文件 + memory `project-finish-requirements-hazards`。先做 Tier 1（T1.1→T1.4，互相独立），再向用户确认 §9 四问后做 Tier 2。
