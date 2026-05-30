# AIWatch

中文 AI 热点精选。流水线:爬取 → LLM 结构化判断 → 确定性评分/晋级 → reader / admin / 公共 Skill。
完整设计与决策见 `docs/superpowers/specs/2026-05-23-aiwatch-hot-design.md`(含 `Resolved Implementation Decisions` 与 `Build & Delivery Decisions`)。

## 前置依赖:Bun(必装)

**Bun 是必装前置依赖**,用于安装 / 开发 / CI。Node 仅作为 web 的兼容运行时,不用于装依赖。`bun.lock` 是唯一锁文件;`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` 禁止提交。

- 安装 Bun:<https://bun.sh>(Windows PowerShell:`irm bun.sh/install.ps1 | iex`)
- `package.json` 钉了 `packageManager: "bun@1.2.21"`。装好后用 `bun --version` 核对,如不同请更新该字段。

## 快速开始(Docker,推荐自托管路径)

```bash
cp .env.example .env             # 设好 BETTER_AUTH_SECRET;LLM/连接器 key 可留空
docker compose up --build        # Postgres + web + worker;web 启动时自动迁移
docker compose run --rm web bun run db:seed:demo            # 可选:灌 mock 演示数据
docker compose run --rm web bun run setup:owner you@example.com 'your-password'
# 打开 http://localhost:3000  (后台:/_admin,先 /login 登录 owner)
```

## 快速开始(本地开发)

```bash
docker compose up -d db          # 本地 Postgres(或自备 DATABASE_URL)
cp .env.example .env             # 至少填 DATABASE_URL;无任何 API key 也能跑 demo
bun install
bun run db:migrate               # 应用迁移(改 schema 后先 bun run db:generate)
bun run db:seed:demo             # 灌少量 mock 数据(无需凭据)
bun run setup:owner you@example.com 'your-password'   # 创建 owner 账号
bun run dev                      # 终端 1: web (Next.js)
bun run worker                   # 终端 2: 长驻 Bun worker (graphile-worker)
```

## 拓扑(单仓库,两个进程)

- `src/app` — Next.js:reader 站 + `/_admin`(不挂导航) + `/api/public`
- `worker/` — 长驻 Bun 进程:爬取 / 判断 / 评分 / 晋级 / 日报 cron
- 共享 framework-agnostic 模块:`src/{db,scoring,llm,connectors,core,auth}`

## 关键原则

- **确定性优先**:LLM 只产出不可变结构化输入;确定性代码/SQL 算出所有派生分。调权重 = 重跑,不重新推理。
- 评分由两个独立信号合成:`base_score`(LLM 维度 → 确定性合成,代表“内容质量”)与 `promotion_score`(`base_score` × 时间衰减 + 来源等级 + 读者强信号 like/star/expert-comment + 专家加权)。`base_score` 不被读者信号污染;`promotion_score` 是 A/S 晋级的唯一闸口,且每 `RECOMPUTE_PROMOTION_SCORE_INTERVAL`(默认 5 分钟)由 `recompute-promotion-scores` 重算。
- 评分权重在 `src/scoring/config.ts`(config-as-code,`scoring_config_version` 版本戳)。每条 score 盖 config/prompt/model 版本 + breakdown 快照;LLM 路由版本戳为 `routing-v2`(`src/llm/routing.ts`)。
- **LLM 失败闭合(fail-closed)**:`cold_judge` 走真实 provider(`OpenAICompatibleProvider`,默认路由 OpenAI/DeepSeek);缺 key 或响应不合 schema 时,事件标记 `judge_failed`(原因 `no_key` / `bad_payload` / `provider_error`),不沉默降级到 stub。要在开发期使用 stub,显式设 `LLM_STUB_FALLBACK=1`。Anthropic / Google 适配器尚未实现,instantiate 时也会失败闭合。
- **专家直推**(`expert direct-push`):专家身份用户可以直接将事件推为 B 级,绕过门槛但仍写入 `selected_breakdown.reason="direct_push"` 与审计记录。A / S 仍走 `promotion_score` 闸口。
- **Source 是数据**(DB 行,后台 CRUD/启停);**Connector 是代码**;订阅控制启用。已落地连接器:`mock` / `rss` / `rsshub`(硬层);其余硬层连接器(github / hn / youtube / huggingface / reddit)注册表里失败闭合,等后续 slice。
- **数据边界**:开源仓库只含代码 + schema + mock 样例;真实信源库 / 事件库 / 评分库是运营资产,不随仓库分发。
- 时间:DB 存 UTC;`APP_TZ`(默认 `Asia/Shanghai`)管报表/显示/语义解析。

## 测试

```bash
bun test src                     # 单元(确定性核心,tests-first)
bun run test:integration         # 集成:真实 Postgres 跑通整条脊柱
                                 #   无 DATABASE_URL 时自动起内嵌 Postgres(免 docker);
                                 #   设了 DATABASE_URL 则用该库(CI 用 pg service)。
```

集成测试覆盖整条 Slice 0 脊柱:source → MockConnector → `$0 gate` → dedup → cold_judge(stub)→ 确定性 `base_score` → append-only event/judgment/score → reader feed 查询,并校验 provenance 版本戳与幂等/append-only 行为。

## 当前状态

**Slice 0(walking skeleton)已完成并验证。** 整条脊柱跑通:Bun worker(graphile-worker)→ Postgres → LLM 判断(stub/真实)→ 确定性评分 → web 渲染 → admin 健康视图。

已落地并验证:
- Drizzle schema + 迁移(`sources/posts/events/event_posts/event_judgments/event_scores` + better-auth 表)
- 确定性核心:`base_score` / `external_heat` / `$0 gate` / dedup / 前缀 ULID(单元测试)
- `SourceConnector`(Mock + RSS/Atom 解析)、事件成形流水线(gate→归一化→去重→事件归并→判断→评分)
- worker:graphile-worker + `enqueue-due-sources`(分钟级 cron)+ `crawl-source`(含熔断)
- Next:reader 首页(事件卡片)、`/_admin` 来源健康(登录 + console 角色保护)、`/login`、better-auth 路由
- 脚本:`db:seed:demo`(复用真实流水线)、`setup:owner`;Docker(web/worker)+ compose + CI

校验:`bun test src`(单元)、`bun run test:integration`(真实 Postgres)、`bun run typecheck`、`bun run build` 均通过。

**Slice 1(B/A/S 晋级锦标赛)已完成并验证。** 确定性晋级跑通,只用 Slice 0 信号(`promotion_score = base_score`;专家/评论/引用等留待后续 slice):

- `src/scoring/promotion.ts` 纯函数锦标赛(门槛 + 滚动窗口 + slot 上限 + S→A→B 级联),golden 测试覆盖
- `src/db/jobs/check-promotion.ts`:加载候选 → 跑锦标赛 → 写 `selected_level/label/promoted_at/selected_breakdown`(只此一处写,绝不降级)
- worker 每 5 分钟跑 `check-promotion`;`db:seed:demo` 也会跑一次,首页直接看到精选标签
- `/_admin` 显示晋级 breakdown(等级/分数/门槛/窗口/排名,可解释、可追溯)
- 校验:10 条 golden 单测 + 6 条真实 Postgres 集成测试

**Slice 2(公共只读 API + Agent Skill)已完成并验证。** 无需 API key 的只读端点 + 可被 Agent 安装的 `aiwatch-hot` Skill(决策 13):

- `GET /api/public/items`:`mode=selected|all`、语义窗口 `since=today|week|month|all`(服务端解析,客户端不算日期边界)、`level/category/q` 过滤、keyset 游标分页(`take` 默认 20、上限 50,无全量导出)
- `src/db/queries/public-items.ts`:keyset 分页查询,服务端搜索(Slice 2 用 ILIKE,FTS 留待检索 slice)、只暴露公共契约(snake_case),不泄露评分 breakdown/provenance
- 防护:CDN 缓存为主(`s-maxage`/`stale-while-revalidate`,selected 比 all 缓存更久)+ 每实例 per-IP 令牌桶(abuse-grade,无 Redis)
- `GET /aiwatch-skill/SKILL.md`(静态、长缓存、不内嵌任何 feed 数据)+ `/aiwatch-skill` 安装页
- 校验:11 条单测(query 解析 + 令牌桶)+ 7 条真实 Postgres 集成测试

**Slice 3(报告:日报/周报/月报)已完成并验证。** 报告完全由事件确定性拼装,LLM 不做任何编辑决策;按 APP_TZ 日历键寻址(决策 E):

- `src/core/time.ts`:APP_TZ 日历日 ↔ UTC 区间换算(DST 安全),`/api/public/daily/{date}` 用 `YYYY-MM-DD`
- `src/reports/build-report.ts` 纯拼装器:三节(今日聚焦 / 值得关注 / 昨日跟进),滚动窗口(日报 24h),golden 测试覆盖
- `src/db/jobs/generate-report.ts`:加载窗口事件 → 拼装 → 按 `(kind, report_date)` upsert;日报自动发布,周/月报落为 `draft` 待审(规范)
- 公共只读端点:`GET /api/public/daily`、`/api/public/daily/{date}`、`/api/public/dailies`(仅返回已发布日报;长缓存)
- reader:`/reports`(最新一期 + 历史)、`/reports/{date}`;`/_admin` 报告列表(类型/日期/状态)
- worker:08:00 日报、周一 08:00 周报草稿、每月 1 日 08:00 月报草稿(worker 以 `TZ=APP_TZ` 运行)
- 校验:16 条单测(时间换算 + 拼装器)+ 8 条真实 Postgres 集成测试

**Slice 4–10 已完成并验证(2026-05-25 → 2026-05-27)。** 围绕读者、专家与运营闭环把脊柱拓宽:

- **Slice 4(社区贡献 + RBAC + 审计)**:`contributions` 工单(推荐来源 / 元数据修正 / 标签建议 / 合并 / 纠错 / 文档)+ capability-based RBAC + append-only `audit_log`,后台分诊/批准/拒绝/应用全链可追溯。
- **Slice 5(读者检索 + 标签筛选)**:服务端 `q`(标题/摘要/来源/标签 ILIKE)+ `tags` 数组重叠;UI 搜索条 + 筛选 chip;一切走 URL 状态,可分享、可 SSR。
- **Slice 6(RSSHub 硬层连接器 + 来源复核建议)**:`RsshubConnector` + 来源建议复核(60 天无精选贡献 / 30 天精选率偏低),只建议、不自动停用。
- **Slice 7(点赞 + 收藏 + 时间分段 rank-score)**:读者反应聚合到 `events.like_count` / `star_count`,时间分段 rank-score(SQL ↔ TS parity,golden 测试)。
- **Slice 8(读者身份 cookie + 反应 UI)**:匿名读者身份 cookie + 反应按钮乐观切换,失败回滚。
- **Slice 9(评论 + 低质判别器)**:以事件为粒度的评论 + 确定性低质判别器(标题复述 / 广告 / 纯立场);低质评论入库但不公开展示。
- **Slice 10(事件详情页 + 评论 UI)**:`/event/{id}` 完整详情 + 评论分区(专家观点 / 高质量讨论 / 最新评论)。
- **Scoring Integrity slice(2026-05-27)**:`base_score` / `promotion_score` 拆分,A/S 闸口改用 `promotion_score`,`recompute-promotion-scores` 定期重算,真实 LLM provider 上线且 fail-closed(`judge_failed` 状态),专家直推绕过 B 级门槛。
- **Alignment Closeout(2026-05-28)**:LLM 路由 v2(默认路由只走已实现的 OpenAI 兼容适配器,Anthropic / Google instantiate 失败闭合保留为契约),`recompute-promotion-scores` 不再覆盖前一次 `rank_score`(与 rank-score job 顺序无关),增加 `bun run doctor` 诊断脚本。
- **读者来源类型筛选(2026-05-28)**:首页 chip 多选 `sourceTypes`(official / employee / expert / kol / media / community / open_source_project),URL 状态,服务端 `inArray` 过滤,集成测试覆盖。
- **spend_guard(2026-05-30)**:LLM 月度预算闸口。`src/llm/pricing.ts` 按厂商**每百万 token** 价目表算成本(`costForUsage`),`src/llm/budget.ts` 给出 ok/warn/block 分档(<80% / ≥80% / ≥100%)。provider 现在回传 `{ value, usage }`,真实调用后把成本写入 append-only `llm_spend_ledger`(按 UTC `month_key` 分桶);每次 `cold_judge` 真实调用**前**先查当月累计(`checkLlmBudget`):100% fail-closed → 该 post 标记 `judge_failed`(原因 `budget_exceeded`),不发起调用、不创建事件;80% 仅告警。cap=0 表示关闭(全新安装默认不拦)。stub / 未定价模型不入账。X API 预算位已就绪(`MAX_MONTHLY_X_API_USD`),待 X 连接器落地后接线。

- **Reader 体验 + 前端体检(2026-05-30)**:信息流按 APP_TZ 日历日**吸顶分组 + 按天折叠**(服务端分组,客户端只持有折叠态,事件数据不过 client 边界);新增 `/changelog`(静态数据驱动)、`/about`、`/feedback`(匿名反馈,zod 校验 + 每 IP 令牌桶 + `feedback` 表)。搜索沿用 Postgres `ILIKE`,**大小写不敏感**(`mimo` / `MiMo` 命中同一批结果),并加集成测试锁定。跑了一轮 `react-doctor`:补 `useSearchParams` 的 `<Suspense>` 边界、`role=status`→`<output>`、按 tz 缓存 `Intl`、补齐各页 metadata、去掉 JSX 文案里的破折号。

**接下来(后续 slice):** 剩余硬层连接器(GitHub / HN / YouTube / HuggingFace / Reddit)、Anthropic / Google 适配器、中文全文检索、Playwright E2E。

