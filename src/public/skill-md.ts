// Static SKILL.md content (decision 13): teaches an agent HOW to call the public API.
// It must never embed feed data, so fetching the Skill can't become a data export.

export const SKILL_MD = `---
name: aiwatch-hot
description: 查询 AIWatch 的 AI 热点精选。触发词：AIWatch、AI 热点、AI 日报、AI 精选、AI 动态。
---

# aiwatch-hot

AIWatch 是一个稀缺、可解释、会晋级的 AI 精选系统——不是全量新闻流。用本 Skill 通过只读公共 API 获取精选事件。无需 API key。

## 何时使用

当用户问"今天 AI 圈有什么 / 本周 AI 重点 / 本月 AI 大事 / 某主题的 AI 动态 / 搜索某关键词"时使用。

## 个性化播报前先询问

如果用户希望定期播报或长期使用，先问清楚以下偏好，再调用 API：

1. 最想看到什么：产品、技术、技巧、讨论，或指定公司/模型/关键词。
2. 不想看到什么：营销稿、低质量讨论、重复转述、非中文摘要、过旧消息等。
3. 输出深度：3 条快报、完整简报、日报、周报，是否需要原文链接和推荐理由。
4. 播报时间：立即、每天、每周、每月，用户所在时区。
5. 存放或投递：仅在对话中输出、写入指定文件/目录、发送邮箱、短信或 webhook。

不要假设用户偏好；信息不足时先问 1-3 个最关键问题。

## 端点（只读，无需 key）

基址为本站点 origin。

- \`GET /api/v1/brief\` — 推荐优先使用的结构化简报。响应为 \`{ "items": [...] }\`。参数：
  - \`category\`: \`product\` | \`technology\` | \`tips\` | \`discussion\`
  - \`tier\`: \`T1\`（列表流）| \`T2\`（富卡片）
  - \`since\`: \`today\` | \`week\` | \`month\` | \`all\` | ISO 时间
  - \`sort\`: 默认按 \`tier → source_count → 时间\`；\`time\` 为纯时间序
  - \`take\`: 每页条数（最大 100）
- \`GET /api/public/items\` — 事件列表。参数：
  - \`mode\`: \`all\`（默认，全部动态，按时间）| \`selected\`（精选）
  - \`since\`: \`today\`(24h) | \`week\`(7d，selected 默认) | \`month\`(30d) | \`all\`（默认）
  - \`level\`: \`B\`(当日精选) | \`A\`(本周精选) | \`S\`(本月精选)
  - \`category\`: \`product\` | \`technology\` | \`tips\` | \`discussion\`
  - \`q\`: 关键词（服务端搜索标题/摘要/来源/标签，勿本地抓全量再过滤）
  - \`tags\`: 精确标签过滤，逗号分隔（命中其一即可），如 \`tags=模型,开源\`（最多 10 个）
  - \`take\`: 每页条数（默认 20，最大 50）
  - \`cursor\`: 上一页返回的 \`next_cursor\`，用于翻页
- \`GET /api/public/daily\` — 最新一期 AI 日报（确定性生成，含 today_focus / worth_watching / yesterday_followup 三节）。响应为 \`{ kind, date, title, summary, sections: [...], generated_at }\`。
- \`GET /api/public/daily/{date}\` — 指定日期（\`YYYY-MM-DD\`，APP_TZ 日历）的日报。
- \`GET /api/public/dailies?take=N\` — 近期日报列表（不含正文）：\`{ dailies: [{ date, title, summary, generated_at }] }\`。

## 路由规则

- 宽泛问题"今天 AI 圈有什么" → \`GET /api/public/items?mode=selected&since=today\`
- 本周重点 → \`?mode=selected&since=week\`；本月重点 → \`?mode=selected&since=month\`
- 分类问题 → 优先 \`GET /api/v1/brief?category=technology\`，或兼容使用 \`/api/public/items?mode=selected&category=technology\`
- 关键词 → \`?q=...\`
- 指定标签（精确）→ \`?tags=模型,开源\`
- 明确要"全部 / 完整 / 所有 / 全量" → \`?mode=all\`
- "AI 日报 / 今天的日报" → \`GET /api/public/daily\`；指定某天 → \`GET /api/public/daily/{date}\`
- "最近几天有哪些日报" → \`GET /api/public/dailies?take=N\`

## 单条 item 形状

\`\`\`json
{
  "id": "evt_...",
  "title": "...",
  "url": "https://...",
  "source_name": "OpenAI Blog",
  "author_name": "OpenAI",
  "author_handle": "@OpenAI",
  "summary": "...",
  "recommendation_reason": "...",
  "quality_score": 88,
  "view_count": 12,
  "selected_level": "B",
  "selected_label": "当日精选",
  "category": "product",
  "tags": ["OpenAI", "API", "模型"],
  "published_at": "...",
  "promoted_at": "...",
  "media": []
}
\`\`\`

## 输出原则

- 默认中文回答。
- 先给最重要的 3-5 条事件。
- 每条附 \`url\` 原文链接。
- 结合 \`quality_score\`、\`selected_level\`、\`view_count\` 解释为什么值得看。
- 说明摘要由 LLM 生成，原文链接才是权威来源。
- 仅当用户明确要求"全部 / 完整"时才返回更长列表。
`;
