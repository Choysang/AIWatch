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
