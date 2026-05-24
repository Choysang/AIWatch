// APP_TZ calendar helpers (decision E). All instants are stored as timestamptz UTC, but
// reports are calendar-keyed in APP_TZ. These resolve a calendar date <-> the UTC instant
// range it covers, so report windows never depend on the server's local timezone. DST-safe
// (day length is derived from the next day's start, not a naive +24h).

export const APP_TZ = process.env.APP_TZ ?? "Asia/Shanghai";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Offset in ms such that wallclock = utc + offset, for `tz` at instant `date`. */
function tzOffsetMs(tz: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The calendar date `n` days from `date` ("YYYY-MM-DD"), via UTC arithmetic. */
export function addCalendarDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function nextCalendarDate(date: string): string {
  return addCalendarDays(date, 1);
}

/** UTC instant of 00:00 wallclock on calendar `date` (YYYY-MM-DD) in `tz`. */
function startOfDayUtc(date: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 0, 0, 0);
  const offset = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - offset);
}

/** Calendar date "YYYY-MM-DD" for `instant` rendered in `tz`. */
export function appCalendarDate(instant: Date, tz: string = APP_TZ): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export interface DayBounds {
  /** Inclusive UTC start of the calendar day. */
  start: Date;
  /** Exclusive UTC end (== next day's start), so ranges are [start, end). */
  end: Date;
}

/** UTC instant range [start, end) covering calendar `date` (YYYY-MM-DD) in `tz`. DST-safe. */
export function dayBoundsUtc(date: string, tz: string = APP_TZ): DayBounds {
  const start = startOfDayUtc(date, tz);
  const end = startOfDayUtc(nextCalendarDate(date), tz);
  return { start, end };
}

/** True when `date` is a valid "YYYY-MM-DD" string (used to validate /daily/{date} input). */
export function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

export { DAY_MS };
