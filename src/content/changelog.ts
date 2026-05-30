// Changelog entries (decision G: Chinese-first). Plain data so a new entry is a one-line
// append, and the /changelog page stays a pure render. Newest first. `type` keys the badge
// label in the i18n catalog (messages.changelog.type).
//
// Scope note: this tracks reader-visible changes to the open-source skeleton — it is not
// the production product's changelog.

export type ChangelogType = "feature" | "improvement" | "fix" | "removed";

export interface ChangelogEntry {
  /** APP_TZ calendar date, YYYY-MM-DD. */
  date: string;
  type: ChangelogType;
  title: string;
  /** One or more short paragraphs of body copy. */
  body: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-05-30",
    type: "feature",
    title: "spend_guard 月度预算闸口上线",
    body: [
      "LLM 调用现在按厂商每百万 token 价目计入一个 append-only 账本(按 UTC 月份分桶)。",
      "每次真实判断前会先查当月累计:到 100% 直接 fail-closed(该条标记预算耗尽、不发起调用),到 80% 告警。预算默认关闭,设了上限才拦。",
    ],
  },
  {
    date: "2026-05-30",
    type: "fix",
    title: "修复成本计价的千倍偏差",
    body: [
      "价目表里存的是「每百万 token」单价,旧代码却按「每千 token」除,导致每笔成本被高估 1000 倍——一个 50 美元的月预算会在约 5 美分真实花费时就被触发。已修正单位与除数。",
    ],
  },
  {
    date: "2026-05-30",
    type: "improvement",
    title: "信息流按天吸顶 + 折叠,前端体检",
    body: [
      "信息流加了日期吸顶 header 和按天收起/展开,长列表更容易扫,也能快速折叠已经看过的日期。",
      "跑了一轮 react-doctor 前端体检:搜索栏补上 Suspense 边界(不再整页退回客户端渲染),反馈/评论错误提示改用语义化 <output>,时区格式化器按 tz 缓存,补齐各页 metadata。",
    ],
  },
  {
    date: "2026-05-28",
    type: "feature",
    title: "首页新增来源类型筛选",
    body: [
      "首页支持多选来源类型(官方 / 员工 / 专家 / KOL / 媒体 / 社区 / 开源项目),筛选状态写进 URL,可分享、可 SSR。",
    ],
  },
  {
    date: "2026-05-27",
    type: "feature",
    title: "事件详情页 + 评论",
    body: [
      "每个事件有了独立详情页与评论区(专家观点 / 高质量讨论 / 最新评论);确定性低质判别器会把标题复述、广告、纯立场的评论挡在公开展示之外。",
    ],
  },
  {
    date: "2026-05-26",
    type: "feature",
    title: "读者反应:点赞 + 收藏",
    body: [
      "读者可以对事件点赞和收藏,匿名身份用签名 cookie 标识;强信号会影响晋级与排序。按钮乐观切换,失败回滚。",
    ],
  },
];
