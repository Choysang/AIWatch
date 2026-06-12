import { describe, expect, test } from "bun:test";
import { appCalendarDate, dayBoundsUtc } from "./time";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("appCalendarDate", () => {
  test("Asia/Shanghai is UTC+8: an evening-UTC instant rolls into the next calendar day", () => {
    // 16:30Z + 8h = 00:30 next day in Shanghai
    expect(appCalendarDate(new Date("2026-05-24T16:30:00Z"), "Asia/Shanghai")).toBe("2026-05-25");
  });

  test("Asia/Shanghai: a pre-16:00Z instant stays on the same calendar day", () => {
    // 15:30Z + 8h = 23:30 same day in Shanghai
    expect(appCalendarDate(new Date("2026-05-24T15:30:00Z"), "Asia/Shanghai")).toBe("2026-05-24");
  });

  test("UTC zone reflects the raw UTC date", () => {
    expect(appCalendarDate(new Date("2026-05-24T23:59:00Z"), "UTC")).toBe("2026-05-24");
    expect(appCalendarDate(new Date("2026-05-25T00:00:00Z"), "UTC")).toBe("2026-05-25");
  });
});

describe("dayBoundsUtc", () => {
  test("Asia/Shanghai day maps to [prev 16:00Z, this 16:00Z)", () => {
    const { start, end } = dayBoundsUtc("2026-05-24", "Asia/Shanghai");
    expect(start.toISOString()).toBe("2026-05-23T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-24T16:00:00.000Z");
  });

  test("UTC day is the natural midnight-to-midnight range", () => {
    const { start, end } = dayBoundsUtc("2026-05-24", "UTC");
    expect(start.toISOString()).toBe("2026-05-24T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  test("a calendar date round-trips: every instant in the range maps back to that date", () => {
    const { start, end } = dayBoundsUtc("2026-05-24", "Asia/Shanghai");
    expect(appCalendarDate(start, "Asia/Shanghai")).toBe("2026-05-24");
    expect(appCalendarDate(new Date(end.getTime() - 1), "Asia/Shanghai")).toBe("2026-05-24");
    expect(appCalendarDate(end, "Asia/Shanghai")).toBe("2026-05-25"); // end is exclusive
  });

  test("DST spring-forward day is 23 hours long (correctness vs naive +24h)", () => {
    // America/New_York: 2026-03-08 02:00 EST -> 03:00 EDT, so the local day is 23h.
    const { start, end } = dayBoundsUtc("2026-03-08", "America/New_York");
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  test("a normal day is 24 hours long", () => {
    const { start, end } = dayBoundsUtc("2026-05-24", "Asia/Shanghai");
    expect(end.getTime() - start.getTime()).toBe(DAY_MS);
  });
});
