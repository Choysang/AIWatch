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
  title: (ctx) => `${ctx.keywords.join(" / ")} · ${ctx.coverageLabel}`,
  sectionTitles: {
    today_focus: "今日头条",
    worth_watching: "推荐精选",
    yesterday_followup: "补充速览",
  },
  summary: (ctx) => `围绕 ${ctx.keywords.join("、")} · 聚焦 ${ctx.focus} · 关注 ${ctx.watching} · 跟进 ${ctx.followup}`,
  readingPath: (ctx) => (ctx.topTitles.length ? [`先读 ${ctx.topTitles.join(" → ")}`] : []),
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
    tags: over.tags ?? [],
    sourceName: over.sourceName ?? null,
    sourceHandle: over.sourceHandle ?? null,
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

  test("today_focus falls back to high-quality current events when no item was promoted", () => {
    const r = build([
      ev({ id: "useful", qualityScore: 91, publishedAt: within }),
      ev({ id: "also_useful", qualityScore: 84, publishedAt: within }),
      ev({ id: "routine", qualityScore: 72, publishedAt: within }),
    ]);
    expect(section(r, "today_focus").items.map((i) => i.id)).toEqual(["useful", "also_useful"]);
    expect(section(r, "worth_watching").items.map((i) => i.id)).toEqual(["routine"]);
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
    const events = [
      ev({ id: "focus", qualityScore: 95, selectedLevel: "B", promotedAt: within, publishedAt: within }),
      ...Array.from({ length: 8 }, (_, i) =>
        ev({ id: `w${i}`, qualityScore: 80, publishedAt: within }),
      ),
    ];
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
        tags: ["OpenAI", "大模型"],
        sourceName: "OpenAI",
        sourceHandle: "@OpenAI",
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
      tags: ["OpenAI", "大模型"],
      source_name: "OpenAI",
      source_handle: "@OpenAI",
      url: "https://openai.com/x",
    });
  });

  test("title, summary, keywords, and reading path reflect the issue topic", () => {
    const r = build([
      ev({ id: "f", title: "Claude 企业智能体发布", tags: ["Claude", "企业智能体"], selectedLevel: "B", promotedAt: within }),
      ev({ id: "w", title: "双语 ASR 基准", tags: ["双语 ASR"], qualityScore: 80, publishedAt: within }),
    ]);
    expect(r.sections.map((s) => s.key)).toEqual(["today_focus", "worth_watching", "yesterday_followup"]);
    expect(r.keywords).toEqual(["Claude", "企业智能体", "双语 ASR"]);
    expect(r.coverage_label).toBe("05.24 早报");
    expect(r.summary).toBe("围绕 Claude、企业智能体、双语 ASR · 聚焦 1 · 关注 1 · 跟进 0");
    expect(r.title).toBe("Claude / 企业智能体 / 双语 ASR · 05.24 早报");
    expect(r.reading_path).toEqual(["先读 Claude 企业智能体发布 → 双语 ASR 基准"]);
  });

  test("empty input yields three empty sections, not an error", () => {
    const r = build([]);
    expect(r.sections.every((s) => s.items.length === 0)).toBe(true);
    expect(r.summary).toBe("围绕 AI · 聚焦 0 · 关注 0 · 跟进 0");
  });
});
