# 项目体检记录（2026-06-12）

## 技术栈与运行方式

| 项 | 现状 |
|---|---|
| 运行时 | Bun（web 走 Next.js 15 App Router，worker 为独立 Bun 进程） |
| 数据库 | PostgreSQL 16 + Drizzle ORM（迁移在 `src/db/migrations/`） |
| 任务队列 | graphile-worker（抓取/判定/晋级/报告 cron） |
| 认证 | better-auth（邮箱验证码 + OAuth），读者侧另有签名 rid cookie |
| LLM | OpenAI 兼容接口，默认 DeepSeek；两段式判定（轻判 light_judge → 深抽 deep_extract），提示词版本 v4 |
| 部署 | GHCR 镜像（GitHub Actions release.yml，tag `v*` 或手动触发）+ `docker-compose.prod.yml` 拉取式部署，含自托管 RSSHub |

## 常用命令

- 本地启动：`bun run dev:db`（内嵌 PG）→ `bun run dev` / `bun run worker`
- 构建：`bun run build`；类型：`bun run typecheck`；单测：`bun test src`
- 集成测试：`bun test tests/integration --env-file=.env.nonexistent`（走 embedded-pg）
- 信源：`bun run sources:import:curated [--archive-non-curated]`、`bun run sources:audit`
- lint：`next lint` 当前缺 ESLint 配置，会进交互模式（已知问题，门禁以 typecheck+test+build 为准）

## 功能模块清单

阅读端：时间线信息流（年/月/周/日折叠）、精选/最新双模式（默认精选）、搜索+多维筛选（分类/信源类型/评分/时间区间/标签）、当前热点、事件详情页（中文摘要+核心观点+原帖全文折叠+复制原文链接）、点赞/收藏/踩、评论（低质自动隐藏）、通知、我的互动、日报/周报/月报、更新日志/关于/反馈/推荐信源、骨架屏、加载更多、RSS 输出、MCP/Skill 公共接口。
管理端：信源健康、晋级记录、报告、社区贡献审核、反馈查看。
管线：连接器（rss/rsshub/github/hn/manual 等）→ 归一化 → 门控/去重（simhash+fold_key）→ LLM 判定 → 确定性评分/晋级 → 报告生成；spend_guard 控制 LLM 花费。

## 信源配置位置

- 唯一正典：`data/sources/curated_ai_sources.json`（30 个严选源）
- 审计依据：`data/sources/source_audit_report.csv`（967 个候选的去留记录）
- 连通性报告：`data/sources/source_connectivity_report.csv`（`bun run sources:audit` 生成）
- 临时原始 OPML 池已在筛选完成后删除，不属于项目资产。

## 体检时门禁状态

- `bun run typecheck`：通过
- `bun test src`：540+ 全绿
- `bun run build`：通过
- `next lint`：缺配置（历史遗留，未阻塞）

## 潜在风险

1. **X 信源依赖自托管 RSSHub 的 twitter 路由**：24/30 个源走 `/twitter/user/*`，需要生产 RSSHub 配置 `TWITTER_AUTH_TOKEN`；未配置则全部失败（详见部署验证步骤）。
2. 轻判门控已放开（所有抓取项都会成为事件），信源白名单成为唯一噪音闸门——严选池故意收窄到 30。
3. 3.5GB 生产机只能串行构建/部署，镜像更新走 GHCR 拉取避免本机构建。
4. 公众号类信源因依赖第三方 RSS 桥接（可用性/合规风险）整体未入核心池，作为可选方向记录在 `docs/future_ideas.md`。

## 下一步计划（本轮执行）

清理临时信源池痕迹 → 严选池连通性验证 → 文档补全 → 门禁 → 推送 + 生产部署 → 生产端信源验证与近 7 天回填抓取。
