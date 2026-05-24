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

## 端点（只读，无需 key）

基址为本站点 origin。响应为 JSON：\`{ "items": [...], "next_cursor": string | null }\`。

- \`GET /api/public/items\` — 事件列表。参数：
  - \`mode\`: \`selected\`（默认，精选）| \`all\`（全部动态，按时间）
  - \`since\`: \`today\`(24h) | \`week\`(7d，selected 默认) | \`month\`(30d) | \`all\`（仅 mode=all 默认）
  - \`level\`: \`B\`(当日精选) | \`A\`(本周精选) | \`S\`(本月精选)
  - \`category\`: 如 \`模型\` / \`产品\` / \`行业\`
  - \`q\`: 关键词（服务端搜索，勿本地抓全量再过滤）
  - \`take\`: 每页条数（默认 20，最大 50）
  - \`cursor\`: 上一页返回的 \`next_cursor\`，用于翻页
- \`GET /api/public/daily\` — 最新一期 AI 日报（确定性生成，含 today_focus / worth_watching / yesterday_followup 三节）。响应为 \`{ kind, date, title, summary, sections: [...], generated_at }\`。
- \`GET /api/public/daily/{date}\` — 指定日期（\`YYYY-MM-DD\`，APP_TZ 日历）的日报。
- \`GET /api/public/dailies?take=N\` — 近期日报列表（不含正文）：\`{ dailies: [{ date, title, summary, generated_at }] }\`。

## 路由规则

- 宽泛问题"今天 AI 圈有什么" → \`GET /api/public/items?mode=selected&since=today\`
- 本周重点 → \`?mode=selected&since=week\`；本月重点 → \`?mode=selected&since=month\`
- 分类问题 → \`?mode=selected&category=模型\`
- 关键词 → \`?q=...\`
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
  "selected_level": "B",
  "selected_label": "当日精选",
  "category": "模型",
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
- 说明摘要由 LLM 生成，原文链接才是权威来源。
- 仅当用户明确要求"全部 / 完整"时才返回更长列表。
`;
