// Static SKILL.md content: teaches an agent HOW to call the public AIWatch API.
// It must never embed feed data, so fetching the Skill cannot become a data export.

export const SKILL_MD = `---
name: aiwatch
description: 读取 AIWatch 的全部 AI 动态、精选内容和每日精编日报。匿名免费，无需 API key。适用于 Claude Code、Codex CLI、Cursor、Gemini CLI、GitHub Copilot、OpenCode、Cline、Windsurf 等任意 Agent。
version: 2026.07.01.hotspots
---

# AIWatch Skill

AIWatch 是一个中文 AI 动态精选与日报系统。这个 Skill 只做匿名只读接入：不需要 API Key，不需要 MCP server，不写入任何数据。

## 触发场景

用户自然地问这些问题时使用本 Skill：

- 今天 AI 圈有什么新东西
- 看一下今天的 AI 日报
- 最近 OpenAI / Anthropic / Perplexity 有什么发布
- 看下精选条目
- 看一下当前 AI 热点
- 最近一周的 AI 论文 / 模型 / 产品 / 技巧
- AI 圈昨天发生了什么
- 最近 3 天 AI 行业动态

## 路由规则

默认先走精选，只有用户明确说"全部 / 完整 / 所有 / 全量"才走全量。

| 用户意图 | 调用端点 |
| --- | --- |
| 宽问题："今天 AI 圈"、"过去 24 小时"、"最近 AI 圈" | \`GET /api/public/items?mode=selected&since=<today/week/month/all>\` |
| 明确说"日报"："AI 日报"、"今天的日报" | \`GET /api/public/daily\` 或 \`GET /api/public/daily/{date}\` |
| 明确说"热点 / 热榜 / 多源都在说什么" | \`GET /api/public/hotspots\` |
| 明确说"全部 / 完整 / 所有 / 全量" | \`GET /api/public/items?mode=all&since=all\` |
| 带分类："AI 模型 / 产品 / 论文 / 技巧" | \`GET /api/public/items?mode=selected&category=...\`；论文优先加 \`contentTypes=research\` |
| 最近 N 天 | 将 N 映射为 \`since=today/week/month\`；需要精确日期时用 \`from=YYYY-MM-DD&to=YYYY-MM-DD\` |
| 公司 / 产品 / 主题搜索 | \`GET /api/public/items?q=OpenAI\`，服务端搜索，不要先抓全量再本地 grep |
| 哪些日期有日报 | \`GET /api/public/dailies?take=N\` |

## API

基址使用当前站点 origin。公共端点匿名可读，无需 token。

### \`GET /api/public/items\`

返回事件列表：\`{ items, next_cursor }\`。

常用参数：

- \`mode\`: \`selected\`（精选，默认）| \`all\`（全部 AI 动态）
- \`since\`: \`today\` | \`week\` | \`month\` | \`all\`
- \`category\`: \`product\` | \`technology\` | \`tips\` | \`discussion\`
- \`contentTypes\`: \`release\` | \`research\` | \`howto\` | \`opinion\` | \`news\`
- \`q\`: 关键词，服务端搜索标题、摘要、来源和标签
- \`tags\`: 标签，逗号分隔，命中其一即可
- \`sourceTypes\`: \`official\`, \`employee\`, \`expert\`, \`kol\`, \`media\`, \`community\`, \`open_source_project\`
- \`sources\`: 指定信源 id，逗号分隔
- \`level\`: \`B\` | \`A\` | \`S\`
- \`minScore\`: 0-100
- \`take\`: 默认 20，最大 50
- \`cursor\`: 上一页返回的 \`next_cursor\`

单条 item 形状：

\`\`\`json
{
  "id": "evt_...",
  "title": "中文标题",
  "url": "https://source.example/article",
  "permalink": "/events/evt_...",
  "body": "站内正文或详细摘要",
  "source_name": "OpenAI Blog",
  "author_name": "OpenAI",
  "author_handle": "@OpenAI",
  "summary": "中文摘要",
  "recommendation_reason": "为什么值得看",
  "quality_score": 88,
  "view_count": 12,
  "selected_level": "B",
  "selected_label": "当日精选",
  "category": "product",
  "content_type": "release",
  "tags": ["OpenAI", "API", "模型"],
  "published_at": "2026-06-27T00:00:00.000Z",
  "promoted_at": "2026-06-27T01:00:00.000Z",
  "created_at": "2026-06-27T01:02:00.000Z",
  "sort_at": "2026-06-27T00:00:00.000Z",
  "media": []
}
\`\`\`

翻页：如果响应里有 \`next_cursor\`，下一次原样传入 \`cursor\`。不要解析 cursor，不要跨端点复用。

### \`GET /api/public/daily\`

最新一期 AIWatch 日报。返回 \`{ kind, date, title, summary, reading_path, sections, generated_at }\`。
\`sections[].items[]\` 内含 \`permalink\`，可直接打开站内中文阅读页。

### \`GET /api/public/daily/{date}\`

读取指定日期日报，\`date\` 为 \`YYYY-MM-DD\`。

### \`GET /api/public/dailies?take=N\`

日报索引，返回 \`{ dailies: [{ date, title, summary, generated_at, item_count, permalink }] }\`。

### \`GET /api/public/hotspots\`

当前热点榜，返回最近 24 小时多源/多次提及的热点事件：\`{ items: [{ id, title, source_count, mention_count, source_names, keywords, score, last_seen_at, permalink }] }\`。
适合回答"现在大家都在讨论什么"、"今天最热的 AI 事件"。优先使用 \`permalink\` 进入站内主事件；\`keywords\` / \`mention_count\` 可解释为什么它热。若为空，说明最近窗口里还没有达到阈值的事件，不要编造。

## RSS

RSS reader 可直接订阅：

- 精选：\`/feed.xml\`
- 全部 AI 动态：\`/feed/all.xml\`
- 日报：\`/feed/daily.xml\`

RSS 2.0，UTF-8。条目标题链接指向站内详情页，正文尽量内联，原文链接保留在条目末尾。

## OpenAPI

严格 schema 见 \`/openapi.yaml\`。开发自定义集成时优先读 OpenAPI，再用本 Skill 的路由规则判断用户意图。

## 版本自检

每个会话第一次使用本 Skill 时，可以轻量读取 \`/aiwatch-skill/SKILL.md\` 的 frontmatter \`version\`。
如果远端版本高于本地版本，在回答末尾提醒一次："AIWatch Skill 有新版本，可让 Agent 重新安装。" 不要每次请求都检查，避免无意义轮询。

## 输出模板

默认中文输出。宽问题给 3-5 条即可，每条包含：

1. 标题
2. 一句话说明发生了什么
3. 为什么值得看
4. 来源 / 时间 / 原文链接或站内 permalink

## 注意事项

- 摘要和推荐理由由 LLM 生成，引用前请用 \`url\` 回原文核对。
- 不要为了关键词搜索拉全量再本地过滤，直接用 \`q\`。
- 不要默认使用 \`mode=all\`；全量流信息密度高，只在用户明确要求时使用。
- 合理轮询。RSS reader 或 cron 建议 30 分钟以上间隔。
`;
