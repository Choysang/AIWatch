import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const sidebarSource = readFileSync(join(import.meta.dir, "reader-sidebar.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("reader sidebar", () => {
  test("keeps the auxiliary sidebar focused on news overview", () => {
    expect(sidebarSource).toContain("资讯速览");
    expect(sidebarSource).toContain('{open ? "收起侧栏" : "资讯速览"}');
    expect(sidebarSource).not.toContain("当前资讯");
    expect(sidebarSource).not.toContain("打开侧栏");
    expect(sidebarSource).not.toContain("<h2>反馈与贡献</h2>");
    expect(sidebarSource).not.toContain("<h2>README</h2>");
    expect(sidebarSource).not.toContain("<h2>播报 Skill</h2>");
  });

  test("scrolls overview items to their feed cards instead of opening detail pages", () => {
    expect(sidebarSource).toContain("scrollToEventCard");
    expect(sidebarSource).toContain("openEventFromOverview");
    expect(sidebarSource).toContain("revealTarget");
    expect(sidebarSource).toContain("aiwatch:reveal-event-card");
    expect(sidebarSource).toContain("scrollIntoView");
    expect(sidebarSource).toContain('behavior: "auto"');
    expect(sidebarSource).toContain("window.innerWidth <= 760");
    expect(sidebarSource).toContain("setOpen(false)");
    expect(sidebarSource).not.toContain('behavior: "smooth"');
    expect(sidebarSource).not.toContain("<TrackableDetailLink");
    expect(sidebarSource).not.toContain('href={`/events/${item.id}`}');
  });

  test("offers a close control inside the opened overview sidebar", () => {
    expect(sidebarSource).toContain("reader-sidebar-head");
    expect(sidebarSource).toContain("reader-sidebar-close");
    expect(sidebarSource).toContain('aria-label="收起资讯速览"');
    expect(sidebarSource).toContain("setOpen(false)");
  });

  test("participates in light reader theme instead of keeping the dark glass surface", () => {
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-sidebar-toggle');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-sidebar,');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-sidebar-head');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-sidebar-close');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-sidebar-jump:hover');
    expect(cssSource).toContain('html[data-reader-theme="light"] .reader-home .day-header');
  });
});
