// Chinese message catalog (decision G: Chinese-first, i18n-ready). All UI strings go
// through the catalog so a future locale only adds a sibling file. This is the shape
// other locales must satisfy (see ../index.ts Messages type).

export const zh = {
  appName: "AIWatch",
  tagline: "AI 热点，稀缺且可解释",
  nav: {
    dynamics: "全部动态",
    selected: "精选",
    reports: "日报",
  },
  home: {
    heading: "全部 AI 动态",
    subheading: "按时间排序的全部动态；精选内容稀缺且可解释。",
    empty: "暂无动态。先运行 worker 抓取，或执行 bun run db:seed:demo 载入演示数据。",
  },
  card: {
    qualityScore: "质量分",
    recommendationReason: "推荐理由",
    source: "来源",
    original: "原文链接",
    summaryNote: "摘要由 LLM 生成，请以原文为准。",
  },
  selectedLabel: {
    none: "",
    B: "当日精选",
    A: "本周精选",
    S: "本月精选",
  },
  report: {
    kind: {
      daily: "日报",
      weekly: "周报",
      monthly: "月报",
    },
    sections: {
      today_focus: "今日聚焦",
      worth_watching: "值得关注",
      yesterday_followup: "昨日跟进",
    },
    counts: {
      focus: "聚焦",
      watching: "关注",
      followup: "跟进",
    },
    heading: "AI 日报",
    subheading: "基于事件、确定性生成的每日精选。每天 08:00（APP_TZ）出一期。",
    empty: "暂无日报。运行 worker 或执行 bun run db:seed:demo 后生成。",
    emptySection: "本节暂无内容。",
    latest: "最新一期",
    archive: "历史日报",
    notFound: "未找到该日期的日报。",
    why: "为什么重要",
  },
  category: {
    label: "分类",
  },
  admin: {
    title: "管理控制台",
    sourceHealth: "来源健康",
    columns: {
      name: "名称",
      platform: "平台",
      level: "等级",
      connector: "连接器",
      enabled: "启用",
      health: "状态",
      lastFetch: "上次抓取",
      nextFetch: "下次抓取",
      failures: "连续失败",
      lastError: "最近错误",
    },
    empty: "暂无来源。",
    loginRequired: "需要登录后访问。",
    promotions: "精选晋级 (B/A/S)",
    promotionColumns: {
      title: "事件",
      level: "等级",
      score: "晋级分",
      threshold: "门槛",
      window: "窗口(天)",
      rank: "窗口内排名",
      promotedAt: "晋级时间",
    },
    noPromotions: "暂无精选事件。运行 worker 或 db:seed:demo 后再看。",
    reports: "报告 (日报/周报/月报)",
    reportColumns: {
      kind: "类型",
      date: "日期",
      status: "状态",
      summary: "摘要",
      generatedAt: "生成时间",
    },
    reportStatus: {
      draft: "草稿",
      published: "已发布",
    },
    noReports: "暂无报告。运行 worker 或 db:seed:demo 后再看。",
  },
} as const;
