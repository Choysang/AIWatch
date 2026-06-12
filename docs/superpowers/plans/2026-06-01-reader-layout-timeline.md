# 阅读器布局与多层时间轴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让阅读器首页顶部贴顶，把单层「按天」信息流改成 年>月>ISO周>日 四层可折叠时间轴，并移除卡片「查看详情」链接。

**Architecture:** 新增一个纯函数模块 `timeline-tree.ts`（把已排序事件流归入年/月/周/日嵌套结构，ISO 周整周挂在「周一所在月」，全部用民用日期运算避免时区问题）；把现有 `DaySection` 泛化成四层通用的 `CollapsibleGroup` 客户端组件；首页递归渲染该树。零数据库迁移；唯一查询触碰是给卡片投影补选已存在的 `created_at` 列作为分组时间回退。

**Tech Stack:** Next.js 15 (App Router, RSC), React 19, TypeScript, Drizzle ORM, bun:test, CSS（globals.css，`.reader-home` 深色主题作用域）。

> 运行约定：测试用 `bun test <路径>`，构建 `bun run build`，类型检查 `bun run typecheck`。若 `bun` 不在 PATH，用其完整路径（见 `reference-dev-environment` 记忆）。提交信息用约定式提交，全程中文/英文皆可。

参考设计文档：`docs/superpowers/specs/2026-06-01-reader-layout-timeline-design.md`

---

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/db/queries/feed.ts` | 卡片投影补选 `created_at`，`EventCard` 加 `createdAt` 字段 | Modify |
| `src/app/_lib/timeline-tree.ts` | 纯函数：ISO 周计算 + 把事件流归入 年>月>周>日 嵌套树 | Create |
| `src/app/_lib/timeline-tree.test.ts` | 上述模块的单元测试 | Create |
| `src/app/(reader)/collapsible-group.tsx` | 四层通用折叠分组客户端组件（由 `day-section.tsx` 泛化而来） | Create（替换 day-section） |
| `src/app/(reader)/day-section.tsx` | 旧的单层按天折叠组件 | Delete |
| `src/app/(reader)/page.tsx` | 用 `buildTimelineTree` + 递归渲染替换 `groupByDay`；卡片时间回退补 `createdAt` | Modify |
| `src/app/(reader)/event-card.tsx` | 移除底部「查看详情」链接及其 `Link` 导入 | Modify |
| `src/app/globals.css` | `.reader-home` 顶部内边距置 0；新增四层分组样式 | Modify |

---

## Task 1: feed.ts 卡片投影补选 createdAt

**Files:**
- Modify: `src/db/queries/feed.ts`（`EventCard` 接口约 11-37 行、`cardColumns` 约 40-66 行）

`created_at` 是 `NOT NULL DEFAULT now()`，补选它后分组时间回退链 `publishedAt ?? promotedAt ?? createdAt` 永远有值——不会再出现「未知时间」。

- [ ] **Step 1: 给 EventCard 接口加 createdAt 字段**

在 `EventCard` 接口里，`promotedAt: Date | null;` 这一行之后插入：

```ts
  createdAt: Date;
```

- [ ] **Step 2: 给 cardColumns 投影补选 created_at**

在 `cardColumns` 对象里，`promotedAt: events.promotedAt,` 这一行之后插入：

```ts
  createdAt: events.createdAt,
```

- [ ] **Step 3: 类型检查**

Run: `bun run typecheck`
Expected: PASS（无新增错误）

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/feed.ts
git commit -m "feat(feed): 卡片投影补选 created_at 作为分组时间回退"
```

---

## Task 2: timeline-tree.ts 纯函数模块（TDD）

**Files:**
- Create: `src/app/_lib/timeline-tree.ts`
- Test: `src/app/_lib/timeline-tree.test.ts`

ISO 周序号与周一日期均为标准算法，在 UTC 午夜实例上做纯民用日期运算（不涉及时区）。分组键源自「周一所在年/月」，日节点保留事件自身日期。

- [ ] **Step 1: 写失败测试**

创建 `src/app/_lib/timeline-tree.test.ts`：

```ts
import { describe, expect, test } from "bun:test";
import type { EventCard } from "@/db/queries/feed";
import {
  buildTimelineTree,
  isoWeekNumber,
  isoWeekStart,
} from "./timeline-tree";

// 用中午 UTC 时间，确保在 APP_TZ(默认 Asia/Shanghai, +8) 下仍是同一民用日。
function at(iso: string): Date {
  return new Date(iso);
}

function mk(
  id: string,
  when: Partial<Pick<EventCard, "publishedAt" | "promotedAt" | "createdAt">>,
): EventCard {
  return {
    id,
    title: `t-${id}`,
    summary: null,
    recommendationReason: null,
    category: null,
    tags: [],
    qualityScore: null,
    selectedLevel: "none",
    selectedLabel: null,
    publishedAt: when.publishedAt ?? null,
    promotedAt: when.promotedAt ?? null,
    createdAt: when.createdAt ?? at("2026-06-01T04:00:00Z"),
    sourceName: null,
    sourcePlatform: null,
    sourceUrl: null,
    sourceType: null,
    sourceBrandTag: null,
    sourceRecommendedBy: null,
    sourceRecommendReason: null,
    sourceOnboardedAt: null,
    authorName: null,
    authorHandle: null,
    url: null,
    media: null,
    likeCount: 0,
    starCount: 0,
  };
}

describe("isoWeekStart / isoWeekNumber", () => {
  test("周一日期与今年第几周（含跨月、跨年边界）", () => {
    expect(isoWeekStart("2026-06-03")).toBe("2026-06-01");
    expect(isoWeekNumber("2026-06-03")).toBe(23);
    expect(isoWeekStart("2026-05-28")).toBe("2026-05-25");
    expect(isoWeekNumber("2026-05-28")).toBe(22);
    // 跨月周：周一 8/31，周日 9/6 —— 整周以周一 8/31 为准
    expect(isoWeekStart("2026-09-02")).toBe("2026-08-31");
    expect(isoWeekNumber("2026-08-31")).toBe(36);
  });
});

describe("buildTimelineTree", () => {
  test("按 年>月>ISO周>日 嵌套，最新在前", () => {
    const events = [
      mk("e1", { publishedAt: at("2026-06-03T04:00:00Z") }),
      mk("e2", { publishedAt: at("2026-06-02T04:00:00Z") }),
      mk("e3", { publishedAt: at("2026-05-28T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);

    expect(tree).toHaveLength(1);
    expect(tree[0].key).toBe("2026");
    expect(tree[0].heading).toBe("2026 年");
    expect(tree[0].count).toBe(3);

    const months = tree[0].months;
    expect(months).toHaveLength(2);
    expect(months[0].heading).toBe("6 月");
    expect(months[0].count).toBe(2);
    expect(months[1].heading).toBe("5 月");

    const juneWeek = months[0].weeks[0];
    expect(juneWeek.heading).toBe("第23周");
    expect(juneWeek.days).toHaveLength(2);
    expect(juneWeek.days[0].items[0].id).toBe("e1");
    expect(juneWeek.days[1].items[0].id).toBe("e2");
  });

  test("跨月 ISO 周整周挂在周一所在月（9月的日落在8月桶下）", () => {
    const events = [
      mk("eA", { publishedAt: at("2026-09-02T04:00:00Z") }),
      mk("eB", { publishedAt: at("2026-08-31T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);

    expect(tree[0].months).toHaveLength(1);
    expect(tree[0].months[0].heading).toBe("8 月");
    const week = tree[0].months[0].weeks[0];
    expect(week.heading).toBe("第36周");
    expect(week.days).toHaveLength(2);
    expect(week.days[0].heading).toContain("9月2日");
    expect(week.days[1].heading).toContain("8月31日");
  });

  test("published/promoted 均为 null 时回退到 createdAt", () => {
    const events = [
      mk("c1", {
        publishedAt: null,
        promotedAt: null,
        createdAt: at("2026-06-03T04:00:00Z"),
      }),
    ];
    const tree = buildTimelineTree(events);
    const day = tree[0].months[0].weeks[0].days[0];
    expect(day.items[0].id).toBe("c1");
    expect(day.heading).toContain("6月3日");
  });

  test("各层计数为后代事件数之和", () => {
    const events = [
      mk("e1", { publishedAt: at("2026-06-03T04:00:00Z") }),
      mk("e2", { publishedAt: at("2026-06-02T04:00:00Z") }),
      mk("e3", { publishedAt: at("2026-05-28T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);
    expect(tree[0].count).toBe(3);
    expect(tree[0].months[0].count).toBe(2);
    expect(tree[0].months[0].weeks[0].count).toBe(2);
    expect(tree[0].months[0].weeks[0].days[0].count).toBe(1);
  });

  test("onLatestPath 只标记最新事件所在的路径", () => {
    const events = [
      mk("e1", { publishedAt: at("2026-06-03T04:00:00Z") }),
      mk("e2", { publishedAt: at("2026-06-02T04:00:00Z") }),
      mk("e3", { publishedAt: at("2026-05-28T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);
    expect(tree[0].onLatestPath).toBe(true);
    expect(tree[0].months[0].onLatestPath).toBe(true); // 6月
    expect(tree[0].months[1].onLatestPath).toBe(false); // 5月
    const week = tree[0].months[0].weeks[0];
    expect(week.onLatestPath).toBe(true);
    expect(week.days[0].onLatestPath).toBe(true); // 6月3日
    expect(week.days[1].onLatestPath).toBe(false); // 6月2日
  });

  test("空输入返回空数组", () => {
    expect(buildTimelineTree([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test src/app/_lib/timeline-tree.test.ts`
Expected: FAIL（`Cannot find module './timeline-tree'` 或导出不存在）

- [ ] **Step 3: 写最小实现**

创建 `src/app/_lib/timeline-tree.ts`：

```ts
// 把已按时间排序（最新在前）的事件流归入 年>月>ISO周>日 嵌套树。
// ISO 周整周挂在「周一（ISO 周起始日）所在的年/月」；日节点保留事件自身日期。
// 所有分桶基于 APP_TZ 民用日期（复用 dayKey），周计算在 UTC 午夜实例上做纯民用运算，
// 不涉及时区偏移，故无 DST 问题。

import type { EventCard } from "@/db/queries/feed";
import { dayKey, formatDayHeading } from "./format";

export interface TimelineDay {
  key: string;
  heading: string;
  count: number;
  onLatestPath: boolean;
  items: EventCard[];
}
export interface TimelineWeek {
  key: string;
  heading: string;
  count: number;
  onLatestPath: boolean;
  days: TimelineDay[];
}
export interface TimelineMonth {
  key: string;
  heading: string;
  count: number;
  onLatestPath: boolean;
  weeks: TimelineWeek[];
}
export interface TimelineYear {
  key: string;
  heading: string;
  count: number;
  onLatestPath: boolean;
  months: TimelineMonth[];
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

/** UTC-midnight instant for a civil YYYY-MM-DD (used only for civil weekday/day math). */
function ymdToUtc(ymd: string): Date {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday (ISO week start) of the civil date `ymd`, as YYYY-MM-DD. */
export function isoWeekStart(ymd: string): string {
  const date = ymdToUtc(ymd);
  const isoDow = (date.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  date.setUTCDate(date.getUTCDate() - isoDow);
  return fmtUtc(date);
}

/** Standard ISO-8601 week number (1–53) for the civil date `ymd`. */
export function isoWeekNumber(ymd: string): number {
  const date = ymdToUtc(ymd);
  const dayNr = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNr + 3); // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / MS_PER_WEEK);
}

/** Effective grouping time: published → promoted → created (created_at is NOT NULL). */
export function effectiveTime(event: EventCard): Date {
  return event.publishedAt ?? event.promotedAt ?? event.createdAt;
}

interface Buckets {
  yearKey: string;
  yearHeading: string;
  monthKey: string;
  monthHeading: string;
  weekKey: string;
  weekHeading: string;
  dayKey: string;
  dayHeading: string;
}

function buckets(event: EventCard): Buckets {
  const when = effectiveTime(event);
  const dk = dayKey(when); // APP_TZ civil day "YYYY-MM-DD"
  const weekStart = isoWeekStart(dk); // Monday "YYYY-MM-DD"
  const { y: wy, m: wm } = parseYmd(weekStart);
  return {
    yearKey: String(wy),
    yearHeading: `${wy} 年`,
    monthKey: `${wy}-${String(wm).padStart(2, "0")}`,
    monthHeading: `${wm} 月`,
    weekKey: weekStart,
    weekHeading: `第${isoWeekNumber(dk)}周`,
    dayKey: dk,
    dayHeading: formatDayHeading(when),
  };
}

/**
 * Group a time-sorted (newest-first) feed into Year>Month>ISO-week>Day buckets.
 * Bucket keys are globally unique, so a contiguous single pass keeps each bucket whole.
 */
export function buildTimelineTree(events: EventCard[]): TimelineYear[] {
  const years: TimelineYear[] = [];
  const latest = events.length > 0 ? buckets(events[0]) : null;

  for (const event of events) {
    const b = buckets(event);

    let year = years[years.length - 1];
    if (!year || year.key !== b.yearKey) {
      year = {
        key: b.yearKey,
        heading: b.yearHeading,
        count: 0,
        onLatestPath: latest?.yearKey === b.yearKey,
        months: [],
      };
      years.push(year);
    }

    let month = year.months[year.months.length - 1];
    if (!month || month.key !== b.monthKey) {
      month = {
        key: b.monthKey,
        heading: b.monthHeading,
        count: 0,
        onLatestPath: latest?.monthKey === b.monthKey,
        weeks: [],
      };
      year.months.push(month);
    }

    let week = month.weeks[month.weeks.length - 1];
    if (!week || week.key !== b.weekKey) {
      week = {
        key: b.weekKey,
        heading: b.weekHeading,
        count: 0,
        onLatestPath: latest?.weekKey === b.weekKey,
        days: [],
      };
      month.weeks.push(week);
    }

    let day = week.days[week.days.length - 1];
    if (!day || day.key !== b.dayKey) {
      day = {
        key: b.dayKey,
        heading: b.dayHeading,
        count: 0,
        onLatestPath: latest?.dayKey === b.dayKey,
        items: [],
      };
      week.days.push(day);
    }

    day.items.push(event);
    day.count++;
    week.count++;
    month.count++;
    year.count++;
  }

  return years;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test src/app/_lib/timeline-tree.test.ts`
Expected: PASS（全部用例通过）

- [ ] **Step 5: Commit**

```bash
git add src/app/_lib/timeline-tree.ts src/app/_lib/timeline-tree.test.ts
git commit -m "feat(timeline): 年/月/ISO周/日 分组纯函数 + 单测"
```

---

## Task 3: CollapsibleGroup 通用折叠组件

**Files:**
- Create: `src/app/(reader)/collapsible-group.tsx`
- Delete: `src/app/(reader)/day-section.tsx`

把 `DaySection` 泛化为四层通用组件；日层沿用 `.day-*` 样式（含吸顶与时间轴），其它层用 `.tl-group--{level}` 修饰。折叠时 `hidden` 而非卸载，保留卡片内客户端岛状态。

- [ ] **Step 1: 创建 collapsible-group.tsx**

```tsx
// 四层通用折叠分组（年/月/周/日）。由 DaySection 泛化而来：只持有 open/closed 本地状态，
// 服务端渲染的子内容以 children 传入（RSC-as-children），事件数据不跨客户端边界。
// 折叠时用 hidden 隐藏而非卸载，保留卡片内客户端岛（点赞/收藏）状态。

"use client";

import { useState } from "react";

export type TimelineLevel = "year" | "month" | "week" | "day";

interface CollapsibleGroupProps {
  level: TimelineLevel;
  heading: string;
  count: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function CollapsibleGroup({
  level,
  heading,
  count,
  children,
  defaultCollapsed = false,
}: CollapsibleGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isDay = level === "day";

  return (
    <section className={`tl-group tl-group--${level}${isDay ? " day-group" : ""}`}>
      <header className={`tl-group-header${isDay ? " day-header" : ""}`}>
        <button
          type="button"
          className="day-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="day-caret" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="day-date">{heading}</span>
          <span className="day-count">{count}</span>
        </button>
      </header>
      <div className={`tl-group-body${isDay ? " day-items" : ""}`} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 删除旧的 day-section.tsx**

```bash
git rm src/app/(reader)/day-section.tsx
```

（`page.tsx` 对它的引用会在 Task 4 改掉；本步后类型检查会暂时失败，属预期。）

- [ ] **Step 3: Commit**

```bash
git add src/app/(reader)/collapsible-group.tsx
git commit -m "feat(reader): 将 DaySection 泛化为四层 CollapsibleGroup"
```

---

## Task 4: page.tsx 接入时间轴树 + 递归渲染

**Files:**
- Modify: `src/app/(reader)/page.tsx`

替换导入、删除 `groupByDay`/`DayGroup`、用 `buildTimelineTree` + 四层递归渲染，卡片时间回退补 `createdAt`。

- [ ] **Step 1: 改导入**

把这两行：

```ts
import { dayKey, formatDayHeading, formatTimeOfDay } from "@/app/_lib/format";
```
```ts
import { DaySection } from "./day-section";
```

分别替换为：

```ts
import { formatTimeOfDay } from "@/app/_lib/format";
```
```ts
import { CollapsibleGroup } from "./collapsible-group";
import { buildTimelineTree } from "@/app/_lib/timeline-tree";
```

- [ ] **Step 2: 删除 groupByDay 与 DayGroup**

删除 `interface DayGroup { … }` 整段（约 92-96 行）和 `function groupByDay(events) { … }` 整段（约 98-113 行，含其上方注释）。

- [ ] **Step 3: 替换 feed 渲染块**

把 `events.length === 0 ? ( … ) : ( … )` 中的 `<div className="feed">…</div>` 整块（即 `groupByDay(events).map(...)` 那段）替换为：

```tsx
        <div className="feed">
          {buildTimelineTree(events).map((year) => (
            <CollapsibleGroup
              key={year.key}
              level="year"
              heading={year.heading}
              count={year.count}
              defaultCollapsed={!year.onLatestPath}
            >
              {year.months.map((month) => (
                <CollapsibleGroup
                  key={month.key}
                  level="month"
                  heading={month.heading}
                  count={month.count}
                  defaultCollapsed={!month.onLatestPath}
                >
                  {month.weeks.map((week) => (
                    <CollapsibleGroup
                      key={week.key}
                      level="week"
                      heading={week.heading}
                      count={week.count}
                      defaultCollapsed={!week.onLatestPath}
                    >
                      {week.days.map((day) => (
                        <CollapsibleGroup
                          key={day.key}
                          level="day"
                          heading={day.heading}
                          count={day.count}
                          defaultCollapsed={!day.onLatestPath}
                        >
                          {day.items.map((event) => {
                            const r =
                              reactions.get(event.id) ?? { liked: false, starred: false };
                            const accent = modelAccent(event);
                            const when =
                              event.publishedAt ?? event.promotedAt ?? event.createdAt;
                            return (
                              <div
                                key={event.id}
                                className="tl-row"
                                style={{ "--card-accent": accent.rgb } as CSSProperties}
                              >
                                <div className="tl-rail">
                                  <time className="tl-time">{formatTimeOfDay(when)}</time>
                                </div>
                                <span className="tl-dot" aria-hidden="true" />
                                <SpotlightCard
                                  accentRgb={accent.rgb}
                                  emphasis={cardEmphasis(event)}
                                >
                                  <EventCard
                                    event={event}
                                    liked={r.liked}
                                    starred={r.starred}
                                    accentLabel={accent.label}
                                    topComments={topComments.get(event.id)}
                                  />
                                </SpotlightCard>
                              </div>
                            );
                          })}
                        </CollapsibleGroup>
                      ))}
                    </CollapsibleGroup>
                  ))}
                </CollapsibleGroup>
              ))}
            </CollapsibleGroup>
          ))}
        </div>
```

- [ ] **Step 4: 类型检查**

Run: `bun run typecheck`
Expected: PASS（`groupByDay`/`DaySection`/`dayKey`/`formatDayHeading` 不再被引用，无未用导入报错）

- [ ] **Step 5: Commit**

```bash
git add "src/app/(reader)/page.tsx"
git commit -m "feat(reader): 首页改用四层折叠时间轴渲染"
```

---

## Task 5: 移除卡片「查看详情」链接

**Files:**
- Modify: `src/app/(reader)/event-card.tsx`

- [ ] **Step 1: 删除 detail-link 与 Link 导入**

删除文件顶部这行：

```ts
import Link from "next/link";
```

并删除 `card-bottom` 内的这段：

```tsx
        <Link className="detail-link" href={`/events/${encodeURIComponent(event.id)}`}>
          {m.detail} →
        </Link>
```

（`/events/[id]` 路由与 `messages.card.detail` 文案均保留，暂不引用。）

- [ ] **Step 2: 类型检查**

Run: `bun run typecheck`
Expected: PASS（`Link` 在该文件已无其它用途）

- [ ] **Step 3: Commit**

```bash
git add "src/app/(reader)/event-card.tsx"
git commit -m "feat(reader): 移除卡片「查看详情」链接"
```

---

## Task 6: globals.css 顶部贴顶 + 四层分组样式

**Files:**
- Modify: `src/app/globals.css`（`.reader-home` 规则块约 1212 行起；时间轴样式约 1307 行起）

`.page` 用 `padding: var(--space-page)`（四周）。`.reader-home` 规则在源码中位置更靠后，用 `padding-top: 0` 覆盖顶部即可贴顶，左右/底部不变。

- [ ] **Step 1: 顶部内边距置 0**

在 `.reader-home { … }` 规则块内（`color: var(--rh-text);` 之后、闭合 `}` 之前）追加：

```css
  padding-top: 0; /* 点1：顶部贴顶，masthead 紧贴页面顶端；左右/底部仍用 .page 的 --space-page */
```

- [ ] **Step 2: 新增四层分组层次样式**

在 `/* --- vertical timeline --- */` 注释这一行的**前面**插入：

```css
/* --- timeline group nesting (year > month > week > day) --- */
/* 年/月/周为流式标题（不吸顶），逐层缩进 + 字号递减形成层次；日层沿用 .day-* 的吸顶与时间轴。 */
.reader-home .tl-group {
  display: block;
}
.reader-home .tl-group-body[hidden] {
  display: none;
}
.reader-home .tl-group--year {
  margin-top: 1.5rem;
}
.reader-home .tl-group--year > .tl-group-header .day-date {
  font-size: 1.5rem;
}
.reader-home .tl-group--month {
  margin-top: 0.75rem;
  padding-left: 0.5rem;
}
.reader-home .tl-group--month > .tl-group-header .day-date {
  font-size: 1.2rem;
}
.reader-home .tl-group--week {
  margin-top: 0.5rem;
  padding-left: 1rem;
}
.reader-home .tl-group--week > .tl-group-header .day-date {
  font-size: 1rem;
  color: var(--rh-soft);
}
.reader-home .tl-group--year > .tl-group-header,
.reader-home .tl-group--month > .tl-group-header,
.reader-home .tl-group--week > .tl-group-header {
  padding: 0.35rem 0;
}
.reader-home .tl-group--day {
  padding-left: 1.25rem;
}
```

- [ ] **Step 3: 构建验证（CSS 无类型检查，靠构建）**

Run: `bun run build`
Expected: PASS（构建成功，无 CSS/编译错误）

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style(reader): 顶部贴顶 + 四层时间轴分组层次样式"
```

---

## Task 7: 整体验证

**Files:** 无（仅验证）

- [ ] **Step 1: 全量单测**

Run: `bun test src`
Expected: PASS（含新增 `timeline-tree.test.ts`，无回归）

- [ ] **Step 2: 类型检查 + 构建**

Run: `bun run typecheck && bun run build`
Expected: 两者皆 PASS

- [ ] **Step 3: 手动核对（本地起站点）**

启动开发库与站点（参考现有脚本：`bun run dev:db` 起内嵌 Postgres、`bun run dev` 起 Next.js，必要时 `bun run db:seed:demo` 灌示例数据），打开首页核对：
- [ ] 顶部无可见空白，大标题紧贴页面顶端；`/reports`、`/about` 等其它页面顶部布局未变。
- [ ] 信息流呈 年>月>周>日 四层；每层可独立折叠/展开；折叠父级隐藏全部后代。
- [ ] 进页面时最新事件所在的 年→月→周→日 路径默认展开，其余折叠；周标题显示「第N周」。
- [ ] 折叠再展开某天后，卡片内点赞/收藏状态不丢失。
- [ ] 卡片底部不再有「查看详情」链接。
- [ ] 各层右侧计数等于其后代事件数之和。

- [ ] **Step 4: Commit（如手动核对中有微调）**

```bash
git add -A
git commit -m "fix(reader): 手动核对后的时间轴/布局微调"
```

---

## Self-Review 记录

- **Spec 覆盖**：点1→Task 6；点6（分组）→Task 2，（组件）→Task 3，（渲染/默认展开）→Task 4，（createdAt 回退）→Task 1+2+4，（样式层次/仅日吸顶）→Task 6；点7a→Task 5。全部覆盖。
- **类型一致**：`EventCard.createdAt`（Task 1）被 `effectiveTime`（Task 2）与 page 卡片 `when`（Task 4）使用；`buildTimelineTree`/`TimelineYear` 等节点字段（`key/heading/count/onLatestPath/months/weeks/days/items`）在 Task 2 定义、Task 4 消费，命名一致；`CollapsibleGroup` props（`level/heading/count/defaultCollapsed/children`）Task 3 定义、Task 4 使用一致。
- **无占位符**：各步均含完整代码/命令/预期。
