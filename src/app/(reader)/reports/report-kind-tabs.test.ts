// 日/周/月报粒度切换器（读者「速览」筛选）的结构断言，沿用本目录组件以源码字符串断言的约定。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const tabsSource = readFileSync(join(import.meta.dir, "report-kind-tabs.tsx"), "utf8");
const kindPageSource = readFileSync(join(import.meta.dir, "kind-report-page.tsx"), "utf8");
const dailyPageSource = readFileSync(join(import.meta.dir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "..", "globals.css"), "utf8");

describe("report kind switcher", () => {
  test("links to all three granularities with the canonical routes", () => {
    expect(tabsSource).toContain('{ kind: "daily", href: "/reports" }');
    expect(tabsSource).toContain('{ kind: "weekly", href: "/reports/weekly" }');
    expect(tabsSource).toContain('{ kind: "monthly", href: "/reports/monthly" }');
    expect(tabsSource).toContain("messages.report");
    expect(tabsSource).toContain("m.kind[tab.kind]");
  });

  test("marks the current kind active for styling and assistive tech", () => {
    expect(tabsSource).toContain('tab.kind === active ? "is-active" : ""');
    expect(tabsSource).toContain('aria-current={tab.kind === active ? "page" : undefined}');
  });

  test("every report page surfaces the switcher (list view and dated view)", () => {
    expect(kindPageSource).toContain('import { ReportKindTabs } from "./report-kind-tabs"');
    // Both KindReportPage (latest list) and KindReportByDate render it under the masthead.
    const occurrences = kindPageSource.split("<ReportKindTabs active={kind} />").length - 1;
    expect(occurrences).toBe(2);
  });

  test("the daily route reuses the shared skeleton so it gains the switcher too", () => {
    expect(dailyPageSource).toContain('import { KindReportPage } from "./kind-report-page"');
    expect(dailyPageSource).toContain('<KindReportPage kind="daily" archiveBase="/reports" />');
  });

  test("active tab is filled with the accent so the selected period is unmistakable", () => {
    expect(cssSource).toContain(".report-kind-tabs {");
    expect(cssSource).toContain(".report-kind-tab.is-active {");
    const activeBlock = cssSource.slice(
      cssSource.indexOf(".report-kind-tab.is-active {"),
      cssSource.indexOf("}", cssSource.indexOf(".report-kind-tab.is-active {")),
    );
    expect(activeBlock).toContain("background: var(--accent);");
  });
});
