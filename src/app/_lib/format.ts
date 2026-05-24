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
