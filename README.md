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
- 评分权重在 `src/scoring/config.ts`(config-as-code,`scoring_config_version` 版本戳)。每条 score 盖 config/prompt/model 版本 + breakdown 快照。
- **Source 是数据**(DB 行,后台 CRUD/启停);**Connector 是代码**;订阅控制启用。
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

**接下来(后续 slice):** 贡献流、评论、专家加权、更多连接器(RSSHub/GitHub/Reddit…)、中文全文检索、完整 RBAC 与审计日志、Playwright E2E。

