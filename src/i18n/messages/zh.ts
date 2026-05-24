// Chinese message catalog (decision G: Chinese-first, i18n-ready). All UI strings go
// through the catalog so a future locale only adds a sibling file. This is the shape
// other locales must satisfy (see ../index.ts Messages type).

export const zh = {
  appName: "AIWatch",
  tagline: "AI 热点，稀缺且可解释",
  nav: {
    dynamics: "全部动态",
    selected: "精选",
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
  },
} as const;
