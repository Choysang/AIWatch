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
  const first = events[0];
  const latest = first ? buckets(first) : null;

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
