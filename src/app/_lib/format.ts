// Display formatting helpers. Time is rendered in APP_TZ (decision E); the stored
// value is always timestamptz UTC. Reader UI never depends on server local time.

const APP_TZ = process.env.APP_TZ ?? "Asia/Shanghai";

const dateTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateTimeFmt.format(date);
}

export function formatRelativeTime(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return "";
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

const dateOnlyFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// --- day grouping (sticky date headers + per-day collapse on the feed) ---
// dayKey is the stable grouping key (APP_TZ calendar day, YYYY-MM-DD); dayHeading is the
// human label. Both render in APP_TZ so a day boundary matches what the reader sees.
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayHeadingFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnly(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? dateOnlyFmt.format(date) : "";
}

/** Stable per-day grouping key in APP_TZ (YYYY-MM-DD). "unknown" when the date is missing. */
export function dayKey(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? dayKeyFmt.format(date) : "unknown";
}

/** Human day heading in APP_TZ, e.g. "2026年5月30日 周五". */
export function formatDayHeading(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? dayHeadingFmt.format(date) : "未知日期";
}

// --- timeline rail (per-card publish time on the feed) ---
const timeOfDayFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Time-of-day in APP_TZ as "HH:mm" (e.g. "10:24") for the feed timeline rail. */
export function formatTimeOfDay(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? timeOfDayFmt.format(date) : "";
}

/**
 * ISO-8601 instant for a `<time dateTime>` attribute, or `undefined` when the value is
 * missing/invalid. The visible text stays APP_TZ-localized; this is the machine-readable
 * instant for assistive tech and crawlers.
 */
export function toIsoAttr(value: Date | string | null | undefined): string | undefined {
  const date = toDate(value);
  return date ? date.toISOString() : undefined;
}
