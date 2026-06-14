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
    mainSourceId: null,
    title: `t-${id}`,
    summary: null,
    recommendationReason: null,
    category: null,
    contentType: null,
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
    sourceCount: 1,
    likeCount: 0,
    starCount: 0,
    downCount: 0,
    viewCount: 0,
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
    const year = tree[0]!;
    expect(year.key).toBe("2026");
    expect(year.heading).toBe("2026 年");
    expect(year.count).toBe(3);

    const months = year.months;
    expect(months).toHaveLength(2);
    expect(months[0]!.heading).toBe("6 月");
    expect(months[0]!.count).toBe(2);
    expect(months[1]!.heading).toBe("5 月");

    const juneWeek = months[0]!.weeks[0]!;
    expect(juneWeek.heading).toBe("第23周");
    expect(juneWeek.days).toHaveLength(2);
    expect(juneWeek.days[0]!.items[0]!.id).toBe("e1");
    expect(juneWeek.days[1]!.items[0]!.id).toBe("e2");
  });

  test("跨月 ISO 周整周挂在周一所在月（9月的日落在8月桶下）", () => {
    const events = [
      mk("eA", { publishedAt: at("2026-09-02T04:00:00Z") }),
      mk("eB", { publishedAt: at("2026-08-31T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);

    const months = tree[0]!.months;
    expect(months).toHaveLength(1);
    expect(months[0]!.heading).toBe("8 月");
    const week = months[0]!.weeks[0]!;
    expect(week.heading).toBe("第36周");
    expect(week.days).toHaveLength(2);
    expect(week.days[0]!.heading).toContain("9月2日");
    expect(week.days[1]!.heading).toContain("8月31日");
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
    const day = tree[0]!.months[0]!.weeks[0]!.days[0]!;
    expect(day.items[0]!.id).toBe("c1");
    expect(day.heading).toContain("6月3日");
  });

  test("各层计数为后代事件数之和", () => {
    const events = [
      mk("e1", { publishedAt: at("2026-06-03T04:00:00Z") }),
      mk("e2", { publishedAt: at("2026-06-02T04:00:00Z") }),
      mk("e3", { publishedAt: at("2026-05-28T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);
    const year = tree[0]!;
    expect(year.count).toBe(3);
    expect(year.months[0]!.count).toBe(2);
    expect(year.months[0]!.weeks[0]!.count).toBe(2);
    expect(year.months[0]!.weeks[0]!.days[0]!.count).toBe(1);
  });

  test("onLatestPath 只标记最新事件所在的路径", () => {
    const events = [
      mk("e1", { publishedAt: at("2026-06-03T04:00:00Z") }),
      mk("e2", { publishedAt: at("2026-06-02T04:00:00Z") }),
      mk("e3", { publishedAt: at("2026-05-28T04:00:00Z") }),
    ];
    const tree = buildTimelineTree(events);
    const year = tree[0]!;
    expect(year.onLatestPath).toBe(true);
    expect(year.months[0]!.onLatestPath).toBe(true); // 6月
    expect(year.months[1]!.onLatestPath).toBe(false); // 5月
    const week = year.months[0]!.weeks[0]!;
    expect(week.onLatestPath).toBe(true);
    expect(week.days[0]!.onLatestPath).toBe(true); // 6月3日
    expect(week.days[1]!.onLatestPath).toBe(false); // 6月2日
  });

  test("空输入返回空数组", () => {
    expect(buildTimelineTree([])).toEqual([]);
  });
});
