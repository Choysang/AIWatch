# AIWatch

> AIWatch 是一个中文优先的 AI 信息雷达：抓取一手信源，自动去重归组，翻译整理成站内可读内容，再输出精选流、全部动态、日报/周报/月报、RSS、公开 API 和 Agent Skill。

[在线体验](https://aiwatch.icu/) · [RSS 精选](https://aiwatch.icu/feed.xml) · [Agent Skill](https://aiwatch.icu/aiwatch-skill/) · [OpenAPI 3.1](https://aiwatch.icu/openapi.yaml)

## 最新亮点

- **24 小时关键词热点**：热点榜不只看同一个事件的信源数，也会统计最近 24 小时被反复提及的鲜明模型/产品词（如 GPT-5.6、Sonnet5、Fable5），并优先跳到官方或主事件详情页。
- **热点 API 更可解释**：`GET /api/public/hotspots` 现在返回 `keywords` 和 `mention_count`，Agent 可以直接说明“为什么它是热点”。
- **同产品发布自动折叠**：官方源或多个博主短时间围绕同一模型/产品连续发布时，会用共同产品词 + 发布语境合并到同一事件合集，减少首页刷屏。
- **同事件合集轮播**：一个新品/模型被官方和多个信源连续提及时，首页卡片会保留主事件，并把相关来源收进可横向滑动的合集，不再一条条刷屏。
- **噪音信源继续降级**：MarkTechPost、量子位、TechCrunch AI、Ollama Releases、Latent Space、ComfyUI、Anyscale、Jason Liu、Replit、CrewAI、Ars Technica AI、MIT Technology Review AI、LangGraph、Lilian Weng 等已从默认 curated 信源中移除。
- **相似资讯合并更积极**：同一官方消息被多个博主、媒体或开发者转发时，会用 URL、simhash 和标题/摘要相似度三层归组，减少短时间刷屏，也让热点榜更容易识别多源共振。
- **图文内容轻微提权**：有清晰文字且带图片/视频的资讯会获得小幅确定性加权，避免有演示截图、产品界面或实验结果的实用内容被误判成普通转发。
- **筛选面板可拉伸**：指定信源面板默认更宽，并支持桌面端横向拖拽，信源多、名字长时更容易筛选。
- **实时刷新更稳**：新内容提示现在按信息流真实排序时间 `sort_at` 判断，只在确实有更新的资讯时提示，点击后回到顶部。
- **热点榜更稳**：多信源报道的弱热点不会再被过严阈值清成空榜；`GET /api/public/hotspots` 也能直接读取当前热点。
- **详情页一键分享**：移动端优先调系统分享面板，桌面端自动复制标题、摘要和站内链接，方便发到微信、知乎、小红书、抖音等平台。
- **Markdown 导出更适合知识库**：详情页提供稳定的标准 Markdown 下载链接，也支持 Obsidian、JSON 和自定义模板；标准模板包含标题、来源、发布时间、AIWatch 分数、精选标记、站内链接、原文链接、精选理由、AI 摘要和正文。
- **筛选更动态**：分类和信源筛选只展示当前条件下有内容的选项，指定信源支持搜索，长信源名不会撑坏面板。
- **精选算法继续降噪**：个人博主自我推广、课程/订阅/咨询导流会降权；有代码、评测、工作流、实践经验的 AI 技术干货会保留。

## 快速使用

### 直接看

- [精选 AI 动态](https://aiwatch.icu/)：宁缺毋滥，按偏好和质量筛掉通稿、营销软文和低价值转发。
- [全部 AI 动态](https://aiwatch.icu/?mode=all)：保留数据库里已有的长期时间线，适合追溯和自己筛选。
- [AIWatch 日报](https://aiwatch.icu/daily)：每天精编，另有周报和月报历史归档。
- [反馈](https://aiwatch.icu/feedback) / [推荐信源](https://aiwatch.icu/recommend-source)：直接提交建议。

### RSS 订阅

| Feed | 适合谁 | URL |
| --- | --- | --- |
| 精选 | 大多数人，只看每天值得点开的内容 | `https://aiwatch.icu/feed.xml` |
| 全部动态 | 想自己筛选、追踪一手信息的人 | `https://aiwatch.icu/feed/all.xml` |
| 日报 | 想在阅读器里每天读一篇成品日报的人 | `https://aiwatch.icu/feed/daily.xml` |

RSS 条目链接指向 AIWatch 站内阅读页；精选 feed 尽量内联中文正文和图片，支持在阅读器里直接读。

### Agent 一句话接入

在 Claude Code、Codex CLI、Cursor、Gemini CLI、GitHub Copilot、OpenCode、Cline、Windsurf 等支持 `SKILL.md` 的 Agent 里发送：

```text
帮我安装这个 skill：https://aiwatch.icu/aiwatch-skill/
```

安装后可以自然提问：

```text
今天 AI 圈有什么新东西
看一下今天的 AI 日报
最近 OpenAI 有什么发布
最近一周的 AI 论文
看下精选条目
最近 3 天 AI 行业动态
AI 圈昨天发生了什么
```

无需 API Key，无需配置 MCP server。Skill 会自动选择精选、全部动态、日报、关键词搜索或日期发现接口。

### API 调用

```bash
curl 'https://aiwatch.icu/api/public/items?mode=selected&since=today'
curl 'https://aiwatch.icu/api/public/items?mode=all&since=week'
curl 'https://aiwatch.icu/api/public/items?q=OpenAI'
curl 'https://aiwatch.icu/api/public/hotspots'
curl 'https://aiwatch.icu/api/public/daily'
curl 'https://aiwatch.icu/api/public/dailies?take=10'
```

公开 API 匿名只读，返回浏览器里也能看到的最终内容字段，包括 `score`、`selected`、站内永久链接、摘要、正文、分类、标签和原文地址。完整字段见 [OpenAPI 3.1](https://aiwatch.icu/openapi.yaml)。

## 当前能力地图

### 阅读体验

- **中文站内读完**：外文网页、博客、X 推文自动整理为中文标题、摘要、推荐理由和正文；术语尽量保留英文原词。
- **原文 / 翻译同页切换**：详情页同时放 AI 摘要、中文翻译和原文，原文可一键再翻译。
- **富文本正文**：支持标题层级、图片、代码块、表格和链接；图片通过代理展示，减少跳原文。
- **图片大图查看**：卡片图片保持原始比例，点击后在站内弹窗查看大图，不再跳新页面。
- **同事件横向合集**：重复报道会在卡片里形成轻量轮播，主来源在前，其余来源作为佐证和延伸阅读。
- **实时刷新提示**：有新内容时出现提示，点击后刷新当前流并回到顶部。
- **一键转发**：详情页支持系统分享；不支持 Web Share API 的环境会复制分享文案。
- **移动端适配**：移动端自动收起侧栏和复杂筛选，保留搜索入口、时间线和紧凑卡片。
- **明暗主题**：首次访问跟随系统深色/浅色；用户手动切换后以用户选择为准。
- **Markdown / Obsidian 导出**：详情页可通过 `/events/{id}/markdown` 下载标准 Markdown，也可导出 JSON 或自定义模板；标准 Markdown 带完整归因，Obsidian 格式保留 frontmatter。

### 内容质量

- **精选算法降噪**：官方 PR、企业客户案例、营销软文、纯车讯、低价值论文和重复转发会降权。
- **长期偏好学习**：管理员“有用 / 无用”标注会影响信源、分类、内容类型和标签权重；普通用户反馈也会作为低权重信号。
- **重复内容合并**：不同信源转发同一官方消息时会归到同一事件；URL、simhash 和标题/摘要相似度共同判断，热点榜用多信源覆盖度判断热度。
- **跨语言归组**：中文报道、英文原文、官方源和 X 讨论指向同一事件时会合并，不把同一件事拆成多条。
- **事件多源视角**：详情页展示同一事件下不同来源的标题、摘要、发布时间和来源类型，方便看共同点与差异。
- **热点榜单**：多个独立信源同时报道或多个来源反复提及同一鲜明关键词的事件会更容易进入热点；热榜入口优先指向官方/主事件详情。

### 日报 / 周报 / 月报

- **日报**：每天上午 7 点（北京时间）发布。
- **周报**：每周一上午 6 点发布。
- **月报**：每月最后一天上午 7 点发布。
- **历史归档**：日报、周报、月报都有历史导航；详情页左侧提供可跟随滚动的历史速览。
- **内容不只限精选**：报告会从当日内容池里挑有用信息，不只机械搬运精选列表。

### 筛选与个人工作台

- **搜索**：关键词在服务端搜索，不要求客户端拉全量再 grep。
- **动态筛选**：支持来源主分支、信源分类、指定信源、内容分类、时间窗和分数组合筛选；没有内容的筛选项不会展示，桌面端指定信源面板可横向拉伸。
- **信源搜索**：信源多时可在筛选面板里直接搜索指定信源。
- **主题板**：用户可创建关注主题，按 tags 和信源组合生成个性化视图。
- **互动**：支持有用、无用、收藏、评论；无用反馈会折叠当前卡片并影响后续推荐。

### 信源与运维

- **多类型信源**：官方、员工、行业专家、KOL、媒体、社区、开源项目等都可纳入。
- **RSS / RSSHub / 手动源**：支持标准 RSS、GitHub release feed、RSSHub X 路由和人工维护源。
- **导入即验证**：新增信源会立即抓最新一条；成功才启用，失败写入原因。
- **X 信源错峰抓取**：RSSHub 的 X 路由会限量入队并错峰执行，避免单个 `TWITTER_AUTH_TOKEN` 被并发打爆导致整站停止更新。
- **信源故障处理台**：后台显示 RSSHub、X token、失败信源、失败原因、建议动作和一键重测。
- **运营看板**：管理员可看信源输出、健康状态、LLM token 消耗、网站访问、资讯点击、日报生成和用户反馈。
- **LLM 失败预警**：LLM judge 失败会进入管道健康检查，不静默吞掉。
- **磁盘与镜像清理**：生产部署脚本会清理旧镜像，后台计划继续纳入运维看板。

### Agent / RSS / API

- **Skill 接入**：一份 `SKILL.md` 可跨 Claude Code、Codex CLI、Cursor、Gemini CLI、OpenCode、Cline、Windsurf 等 Agent 使用。
- **RSS 全文阅读**：精选和日报 feed 面向阅读器优化，尽量让用户不用跳出阅读器。
- **公开 API**：匿名、免费、只读、分页、限流，适合个人脚本、Agent 和轻量集成。
- **热点端点**：`/api/public/hotspots` 输出当前多源热点，适合 Agent 回答“现在 AI 圈都在讨论什么”。
- **Skill 版本自检**：Agent Skill 可轻量检查远端版本，有更新时提醒重新安装。
- **AIWatch AI 助手**：站内提供轻量 AI 问答入口，可围绕当前内容和功能流程做总结与解释。

## 自托管快速启动

### Docker

```bash
cp .env.example .env
docker compose up --build
docker compose run --rm web bun run db:seed:demo
docker compose run --rm web bun run setup:owner you@example.com 'your-password'
```

打开 `http://localhost:3000`。后台地址是 `/_admin`，需要先登录 owner 账号。

### 本地开发

```bash
docker compose up -d db
cp .env.example .env
bun install
bun run db:migrate
bun run db:seed:demo
bun run setup:owner you@example.com 'your-password'
bun run dev
```

另开一个终端运行 worker：

```bash
bun run worker
```

常用检查：

```bash
bun run verify
bun run verify:full
bun run sources:audit
```

## 核心配置

生产环境至少需要：

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CONTRIBUTION_SALT`
- `READER_ID_SECRET`
- `OPENAI_COMPATIBLE_BASE_URL`
- `OPENAI_COMPATIBLE_API_KEY`
- `LLM_NEWS_PROVIDER`
- `LLM_NEWS_MODEL`
- `MAX_MONTHLY_LLM_USD`
- `RSSHUB_BASE_URL`
- `TWITTER_AUTH_TOKEN`
- `SOURCE_ALERT_EMAIL`

如果要邮件预警，还需要配置发信服务，例如 `RESEND_API_KEY` 和 `AUTH_EMAIL_FROM`。

## 技术栈

- **Web**：Next.js App Router、React、TypeScript
- **Runtime**：Bun
- **Database**：PostgreSQL、Drizzle ORM
- **Worker**：graphile-worker
- **Auth**：better-auth
- **Feeds**：RSS / Atom / RSSHub
- **LLM**：OpenAI-compatible provider，带成本预算和失败闭合

## 文档

- [架构概览](docs/architecture.md)
- [信源策略](docs/source_policy.md)
- [GHCR 部署](docs/deploy-ghcr.md)
- [环境变更记录](docs/env-changelog.md)
- [迭代经验](docs/iteration-memory.md)
- [历史需求核对](docs/conversation-requirements-audit.md)

## 边界说明

- 仓库不包含生产数据库、真实用户数据、真实 API Key、cookies、访问 token 或生产 `.env`。
- 公开 API 只读、限流、分页，不提供无限制全量导出。
- 摘要、翻译和推荐理由由 LLM 生成，严肃引用请回原文核对。
- X/Twitter 信源依赖自托管 RSSHub 和有效 `TWITTER_AUTH_TOKEN`。
