// 把事件流归入 年>月>ISO周>日 嵌套树。ISO 周整周挂在「周一（ISO 周起始日）所在的年/月」；
// 日节点保留事件自身日期。所有分桶基于 APP_TZ 民用日期（复用 dayKey），周计算在 UTC 午夜实例上
// 做纯民用运算，不涉及时区偏移，故无 DST 问题。
//
// 分桶按「年/月/周/日复合键」聚合（map），不依赖输入顺序连续：最新/精选按时间倒序喂入，推荐按
// 相关度倒序喂入，两者都能把同一天的卡片聚到一起（修复推荐流时间线碎裂）。物化时各层按键倒序排，
// 日内保留输入顺序（最新/精选=时间倒序，推荐=相关度倒序）。
//
// 默认折叠规则（统一）：最近 EXPAND_RECENT_DAYS 个民用日默认展开，更早默认折叠。锚点取流中最新民用
// 日（而非 events[0]，因为推荐流首条未必最新）。

import type { EventCard } from "@/db/queries/feed";
import { dayKey, formatDayHeading } from "./format";

// 最近多少个民用日默认展开（含当天）。其余默认折叠。
const EXPAND_RECENT_DAYS = 3;

export interface TimelineDay {
  key: string;
  heading: string;
  count: number;
  /** 默认是否展开（最近 EXPAND_RECENT_DAYS 个民用日内）。 */
  defaultExpanded: boolean;
  items: EventCard[];
}
export interface TimelineWeek {
  key: string;
  heading: string;
  count: number;
  defaultExpanded: boolean;
  days: TimelineDay[];
}
export interface TimelineMonth {
  key: string;
  heading: string;
  count: number;
  defaultExpanded: boolean;
  weeks: TimelineWeek[];
}
export interface TimelineYear {
  key: string;
  heading: string;
  count: number;
  defaultExpanded: boolean;
  months: TimelineMonth[];
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const parts = ymd.split("-");
  return { y: Number(parts[0]), m: Number(parts[1]), d: Number(parts[2]) };
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

/** Civil YYYY-MM-DD that is `days` calendar days before `ymd` (pure civil math, no DST). */
function subtractDays(ymd: string, days: number): string {
  const date = ymdToUtc(ymd);
  date.setUTCDate(date.getUTCDate() - days);
  return fmtUtc(date);
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

export type TimelineTimeGetter = (event: EventCard) => Date;

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

function buckets(event: EventCard, getTime: TimelineTimeGetter): Buckets {
  const when = getTime(event);
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

// --- keyed accumulators (group first, sort + materialize after) ---
interface DayAcc {
  key: string;
  heading: string;
  items: EventCard[];
}
interface WeekAcc {
  key: string;
  heading: string;
  days: Map<string, DayAcc>;
}
interface MonthAcc {
  key: string;
  heading: string;
  weeks: Map<string, WeekAcc>;
}
interface YearAcc {
  key: string;
  heading: string;
  months: Map<string, MonthAcc>;
}

/** Sort by civil key, newest first. Keys are fixed-width YYYY[-MM[-DD]], so string order = time order. */
function byKeyDesc<T extends { key: string }>(a: T, b: T): number {
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

function toDay(acc: DayAcc, expandFrom: string): TimelineDay {
  return {
    key: acc.key,
    heading: acc.heading,
    count: acc.items.length,
    // 民用日键是定宽 YYYY-MM-DD，字典序比较即日期比较。
    defaultExpanded: expandFrom !== "" && acc.key >= expandFrom,
    items: acc.items,
  };
}

function toWeek(acc: WeekAcc, expandFrom: string): TimelineWeek {
  const days = [...acc.days.values()].map((d) => toDay(d, expandFrom)).sort(byKeyDesc);
  return {
    key: acc.key,
    heading: acc.heading,
    count: days.reduce((n, d) => n + d.count, 0),
    defaultExpanded: days.some((d) => d.defaultExpanded),
    days,
  };
}

function toMonth(acc: MonthAcc, expandFrom: string): TimelineMonth {
  const weeks = [...acc.weeks.values()].map((w) => toWeek(w, expandFrom)).sort(byKeyDesc);
  return {
    key: acc.key,
    heading: acc.heading,
    count: weeks.reduce((n, w) => n + w.count, 0),
    defaultExpanded: weeks.some((w) => w.defaultExpanded),
    weeks,
  };
}

function toYear(acc: YearAcc, expandFrom: string): TimelineYear {
  const months = [...acc.months.values()].map((m) => toMonth(m, expandFrom)).sort(byKeyDesc);
  return {
    key: acc.key,
    heading: acc.heading,
    count: months.reduce((n, m) => n + m.count, 0),
    defaultExpanded: months.some((m) => m.defaultExpanded),
    months,
  };
}

/**
 * Group a feed into Year>Month>ISO-week>Day buckets. Robust to input order: bucketing is
 * key-based (a Map per level), so a non-time-sorted feed (推荐 = relevance order) still groups
 * each civil day together instead of fragmenting. Each level is then sorted newest-first; within
 * a day, items keep their input order. The most recent EXPAND_RECENT_DAYS civil days are flagged
 * defaultExpanded (the rest collapse by default), anchored at the newest civil day in the feed.
 */
export function buildTimelineTree(
  events: EventCard[],
  getTime: TimelineTimeGetter = effectiveTime,
): TimelineYear[] {
  if (events.length === 0) return [];

  const yearMap = new Map<string, YearAcc>();
  let newestDayKey = "";
  for (const event of events) {
    const b = buckets(event, getTime);
    if (b.dayKey !== "unknown" && b.dayKey > newestDayKey) newestDayKey = b.dayKey;

    let year = yearMap.get(b.yearKey);
    if (!year) {
      year = { key: b.yearKey, heading: b.yearHeading, months: new Map() };
      yearMap.set(b.yearKey, year);
    }
    let month = year.months.get(b.monthKey);
    if (!month) {
      month = { key: b.monthKey, heading: b.monthHeading, weeks: new Map() };
      year.months.set(b.monthKey, month);
    }
    let week = month.weeks.get(b.weekKey);
    if (!week) {
      week = { key: b.weekKey, heading: b.weekHeading, days: new Map() };
      month.weeks.set(b.weekKey, week);
    }
    let day = week.days.get(b.dayKey);
    if (!day) {
      day = { key: b.dayKey, heading: b.dayHeading, items: [] };
      week.days.set(b.dayKey, day);
    }
    day.items.push(event);
  }

  // 最近 EXPAND_RECENT_DAYS 个民用日默认展开：[newestDayKey - (N-1), newestDayKey]。
  const expandFrom = newestDayKey ? subtractDays(newestDayKey, EXPAND_RECENT_DAYS - 1) : "";
  return [...yearMap.values()].map((y) => toYear(y, expandFrom)).sort(byKeyDesc);
}
