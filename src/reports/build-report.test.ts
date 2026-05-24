import { describe, expect, test } from "bun:test";
import { buildReport, type BuildReportParams } from "./build-report";
import type { ReportEvent, ReportText, SectionKey } from "./types";

const NOW = new Date("2026-05-24T16:00:00Z"); // = 2026-05-25 00:00 Shanghai
const WINDOW = { start: new Date("2026-05-23T16:00:00Z"), end: NOW }; // the 2026-05-24 day
const DAY = 24 * 60 * 60 * 1000;
const within = new Date(WINDOW.start.getTime() + 6 * 60 * 60 * 1000); // mid-window
const prior = new Date(WINDOW.start.getTime() - 6 * 60 * 60 * 1000); // prior window
const old = new Date(WINDOW.start.getTime() - 3 * DAY); // well before

const TEXT: ReportText = {
  title: "日报 · 2026-05-24",
  sectionTitles: {
    today_focus: "今日聚焦",
    worth_watching: "值得关注",
    yesterday_followup: "昨日跟进",
  },
  summary: (c) => `聚焦 ${c.focus} · 关注 ${c.watching} · 跟进 ${c.followup}`,
};

function ev(over: Partial<ReportEvent> & { id: string }): ReportEvent {
  return {
    id: over.id,
    title: over.title ?? over.id,
    summary: over.summary ?? null,
    recommendationReason: over.recommendationReason ?? null,
    category: over.category ?? null,
    qualityScore: over.qualityScore ?? null,
    selectedLevel: over.selectedLevel ?? "none",
    selectedLabel: over.selectedLabel ?? null,
    url: over.url ?? null,
    publishedAt: over.publishedAt ?? null,
    promotedAt: over.promotedAt ?? null,
  };
}

function build(events: ReportEvent[], over: Partial<BuildReportParams> = {}) {
  return buildReport({ kind: "daily", date: "2026-05-24", window: WINDOW, events, text: TEXT, ...over });
}

const section = (r: ReturnType<typeof build>, key: SectionKey) =>
  r.sections.find((s) => s.key === key)!;

describe("buildReport", () => {
  test("today_focus contains events selected within the window, strongest tier first", () => {
    const r = build([
      ev({ id: "b1", selectedLevel: "B", promotedAt: within }),
      ev({ id: "s1", selectedLevel: "S", promotedAt: within }),
      ev({ id: "a1", selectedLevel: "A", promotedAt: within }),
    ]);
    expect(section(r, "today_focus").items.map((i) => i.id)).toEqual(["s1", "a1", "b1"]);
  });

  test("today_focus excludes selections promoted outside the window", () => {
    const r = build([
      ev({ id: "in", selectedLevel: "B", promotedAt: within }),
      ev({ id: "prev", selectedLevel: "B", promotedAt: prior }),
      ev({ id: "ancient", selectedLevel: "S", promotedAt: old }),
    ]);
    expect(section(r, "today_focus").items.map((i) => i.id)).toEqual(["in"]);
  });

  test("worth_watching: high-score non-selected events published in-window, by score desc", () => {
    const r = build([
      ev({ id: "hi", qualityScore: 90, publishedAt: within }),
      ev({ id: "mid", qualityScore: 72, publishedAt: within }),
      ev({ id: "low", qualityScore: 50, publishedAt: within }), // below min 70
      ev({ id: "sel", qualityScore: 95, selectedLevel: "B", promotedAt: within, publishedAt: within }),
    ]);
    expect(section(r, "worth_watching").items.map((i) => i.id)).toEqual(["hi", "mid"]);
  });

  test("worth_watching respects the limit and is deterministic on score ties", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      ev({ id: `w${i}`, qualityScore: 80, publishedAt: within }),
    );
    const r = build(events, { config: { version: "t", worthWatchingMinScore: 70, focusLimit: 30, worthWatchingLimit: 3, followupLimit: 10 } });
    expect(section(r, "worth_watching").items.map((i) => i.id)).toEqual(["w0", "w1", "w2"]);
  });

  test("yesterday_followup contains selections from the prior equal-length window only", () => {
    const r = build([
      ev({ id: "today", selectedLevel: "B", promotedAt: within }),
      ev({ id: "yday", selectedLevel: "A", promotedAt: prior }),
      ev({ id: "ancient", selectedLevel: "S", promotedAt: old }),
    ]);
    expect(section(r, "yesterday_followup").items.map((i) => i.id)).toEqual(["yday"]);
  });

  test("item shape maps event fields to the public report shape", () => {
    const r = build([
      ev({
        id: "evt_1",
        title: "GPT-X",
        summary: "发布了新模型",
        recommendationReason: "影响 API 价格",
        category: "模型",
        qualityScore: 88,
        selectedLevel: "B",
        selectedLabel: "当日精选",
        url: "https://openai.com/x",
        promotedAt: within,
      }),
    ]);
    expect(section(r, "today_focus").items[0]).toEqual({
      id: "evt_1",
      title: "GPT-X",
      conclusion: "发布了新模型",
      why: "影响 API 价格",
      quality_score: 88,
      selected_level: "B",
      selected_label: "当日精选",
      category: "模型",
      url: "https://openai.com/x",
    });
  });

  test("summary reflects per-section counts and the three sections are always present", () => {
    const r = build([
      ev({ id: "f", selectedLevel: "B", promotedAt: within }),
      ev({ id: "w", qualityScore: 80, publishedAt: within }),
    ]);
    expect(r.sections.map((s) => s.key)).toEqual(["today_focus", "worth_watching", "yesterday_followup"]);
    expect(r.summary).toBe("聚焦 1 · 关注 1 · 跟进 0");
    expect(r.title).toBe("日报 · 2026-05-24");
  });

  test("empty input yields three empty sections, not an error", () => {
    const r = build([]);
    expect(r.sections.every((s) => s.items.length === 0)).toBe(true);
    expect(r.summary).toBe("聚焦 0 · 关注 0 · 跟进 0");
  });
});
