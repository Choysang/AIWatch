import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const navSource = readFileSync(join(import.meta.dir, "reader-nav-sidebar.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");
const layoutSource = readFileSync(join(import.meta.dir, "..", "layout.tsx"), "utf8");

describe("reader nav sidebar", () => {
  test("contains the requested primary sections and about resources", () => {
    expect(navSource).toContain('className="reader-nav-top"');
    expect(navSource).toContain('className="reader-nav-brand"');
    expect(navSource).toContain("aria-expanded={!collapsed}");
    expect(navSource).not.toContain("reader-nav-collapse");
    expect(navSource).toContain('name="content"');
    expect(navSource).toContain('name="reports"');
    expect(navSource).toContain('name="me"');
    expect(navSource).toContain('name="about"');
    expect(navSource).not.toContain("FEED");
    expect(navSource).not.toContain("DAY");
    expect(navSource).not.toContain("INFO");
    expect(navSource).not.toContain('aria-hidden="true">广</span>');
    expect(navSource).not.toContain('aria-hidden="true">览</span>');
    expect(navSource).not.toContain('aria-hidden="true">关</span>');
    expect(navSource).toContain("内容广场");
    expect(navSource).toContain("每日速览");
    expect(navSource).toContain("我的互动");
    expect(navSource).toContain('href="/me/likes"');
    expect(navSource).toContain('href="/me/stars"');
    expect(navSource).toContain('href="/me/comments"');
    expect(navSource).toContain("点赞");
    expect(navSource).toContain("收藏");
    expect(navSource).toContain("评论");
    expect(navSource).toContain('href="/about"');
    expect(navSource).toContain("日报");
    expect(navSource).toContain("周报");
    expect(navSource).toContain("月报");
    expect(navSource).toContain('href="/reports"');
    expect(navSource).toContain("const [reportExpanded, setReportExpanded] = useState(false);");
    expect(navSource).toContain('aria-expanded={reportExpanded}');
    expect(navSource).toContain("onClick={() => setReportExpanded(true)}");
    expect(navSource).toContain('hidden={!reportExpanded}');
    expect(navSource).toContain('setReportExpanded(pathname?.startsWith("/reports") ?? false);');
    expect(navSource).toContain("const [meExpanded, setMeExpanded] = useState(false);");
    expect(navSource).toContain('aria-expanded={meExpanded}');
    expect(navSource).toContain("onClick={() => setMeExpanded(true)}");
    expect(navSource).toContain('hidden={!meExpanded}');
    expect(navSource).toContain('setMeExpanded(pathname?.startsWith("/me") ?? false);');
    // 点11：周报/月报由禁用占位升级为真实链接
    expect(navSource).toContain('href="/reports/weekly"');
    expect(navSource).toContain('href="/reports/monthly"');
    expect(navSource).not.toContain('aria-disabled="true"');
    expect(navSource).toContain("关于");
    expect(navSource).not.toContain("反馈与贡献");
    expect(navSource).not.toContain("README");
    expect(navSource).not.toContain("播报 Skill");
    expect(navSource).not.toContain("reader-nav-subitems");
    expect(navSource).toContain("ReaderNavAccount");
    expect(navSource).toContain("登录 / 注册");
    expect(navSource).toContain("isConsoleRole");
    expect(navSource).toContain('router.prefetch("/")');
    expect(navSource).toContain('router.prefetch("/reports")');
    expect(navSource).toContain('router.prefetch("/me/likes")');
    expect(navSource).toContain('router.prefetch("/me/stars")');
    expect(navSource).toContain('router.prefetch("/me/comments")');
    expect(navSource).toContain('router.prefetch("/about")');
  });

  test("shows full navigation labels as icon previews in the collapsed sidebar", () => {
    expect(navSource).toContain('className="reader-nav-tooltip"');
    expect(navSource).toContain("内容广场");
    expect(navSource).toContain("每日速览");
    expect(navSource).toContain("我的互动");
    expect(navSource).toContain("关于");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-nav-tooltip");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-nav-icon:hover .reader-nav-tooltip");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-nav-mark:hover .reader-nav-tooltip");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-nav-avatar:hover .reader-nav-tooltip");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-nav-item:focus-visible .reader-nav-tooltip");
  });

  test("keeps nav items compact and sinks about plus account controls to the bottom", () => {
    expect(navSource).toContain('className="reader-nav-bottom"');
    expect(navSource).toContain('className="reader-nav-item reader-nav-about"');
    expect(cssSource).toContain(".reader-nav-sections {\n  display: flex;");
    expect(cssSource).toContain("flex-direction: column;");
    expect(cssSource).toMatch(/\.reader-nav-sections\s*\{[^}]*overflow:\s*visible;/);
    expect(cssSource).not.toMatch(/\.reader-nav-sections\s*\{[^}]*overflow-y:\s*auto;/);
    expect(cssSource).toContain(".reader-nav-bottom {\n  display: flex;");
    expect(cssSource).toContain("flex: 0 0 auto;\n  margin-top: auto;");
    expect(cssSource).toContain("--reader-nav-width: 192px;");
    expect(cssSource).toContain("border-top: 1px solid var(--rh-line);");
    expect(cssSource).toContain("flex-direction: column;");
    expect(cssSource).toContain(".reader-nav-about {\n  flex: 0 0 auto;\n  width: 100%;");
    expect(cssSource).toContain(".reader-nav-bottom .reader-nav-account {\n  width: 100%;");
    expect(cssSource).toContain(
      ".reader-nav-sidebar.is-collapsed .reader-nav-avatar {\n  display: inline-grid;",
    );
    expect(cssSource).toContain("border-color: transparent;");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-nav-bottom {\n  flex-direction: column;");
    expect(cssSource).toContain(".reader-nav-item {\n  min-height: 2.2rem;");
    expect(cssSource).toContain(".reader-nav-text {\n  flex: 1 1 auto;\n  min-width: 0;\n  text-align: center;");
    expect(cssSource).toContain(".reader-nav-report-subitems,\n.reader-nav-me-subitems {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: center;");
    expect(cssSource).toContain(".reader-nav-report-subitems[hidden] {\n  display: none;");
    expect(cssSource).toContain(".reader-nav-me-subitems[hidden] {\n  display: none;");
    expect(cssSource).toContain(".reader-nav-account-text {\n  display: grid;\n  gap: 0.1rem;\n  flex: 1 1 auto;\n  min-width: 0;\n  text-align: center;");
    expect(cssSource).toContain(".reader-nav-text small {\n  display: none;");
    expect(cssSource).toContain(".reader-nav-account-text small {\n  display: none;");
    expect(cssSource).toContain(".reader-nav-account {\n  margin-top: 0;");
    expect(cssSource).toContain(".reader-nav-account:hover {\n  background: rgba(255, 255, 255, 0.07);");
    expect(cssSource).not.toContain("min-height: 3.25rem;");
    expect(cssSource).not.toContain("min-height: 3.1rem;");
  });

  test("adds a bottom browser mode switch with icon previews and persisted theme modes", () => {
    expect(navSource).toContain("type ReaderThemeMode");
    expect(navSource).toContain('const READER_THEME_STORAGE_KEY = "aiwatch:reader-theme-mode"');
    expect(navSource).toContain('className="reader-theme-switch"');
    expect(navSource).toContain('role="radiogroup"');
    expect(navSource).toContain("夜间");
    expect(navSource).toContain("跟随系统");
    expect(navSource).toContain("日间");
    expect(navSource).toContain('name: "dark"');
    expect(navSource).toContain('name: "system"');
    expect(navSource).toContain('name: "light"');
    expect(navSource).toContain('window.matchMedia("(prefers-color-scheme: light)")');
    expect(navSource).toContain("localStorage.setItem(READER_THEME_STORAGE_KEY");
    expect(navSource).toContain("document.documentElement.dataset.readerTheme");
    expect(navSource).toContain("reader-nav-tooltip");

    expect(layoutSource).toContain("readerThemeScript");
    expect(layoutSource).toContain("data-reader-theme");
    expect(layoutSource).toContain("aiwatch:reader-theme-mode");

    expect(cssSource).toContain('html[data-reader-theme="light"]');
    expect(cssSource).toContain(".reader-theme-switch");
    expect(cssSource).toMatch(/\.reader-theme-switch\s*\{[^}]*align-self:\s*center;/);
    expect(cssSource).toMatch(/\.reader-theme-switch\s*\{[^}]*width:\s*fit-content;/);
    expect(cssSource).toMatch(/\.reader-theme-switch\s*\{[^}]*justify-content:\s*center;/);
    expect(cssSource).toContain(".reader-theme-option");
    expect(cssSource).toContain("gap: 0.28rem;");
    expect(cssSource).toContain("flex: 0 0 2.35rem;");
    expect(cssSource).toContain("width: 2.35rem;");
    expect(cssSource).toContain(".reader-theme-option:hover .reader-nav-tooltip");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-theme-switch");
    expect(cssSource).toContain(".reader-nav-sidebar.is-collapsed .reader-theme-option:hover .reader-nav-tooltip");
  });

  test("keeps collapsed previews and nested nav controls on the light theme surface", () => {
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-nav-report-subitems a:hover',
    );
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-nav-me-subitems a:hover',
    );
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-nav-sidebar.is-collapsed .reader-nav-tooltip',
    );
    expect(cssSource).toContain(
      'html[data-reader-theme="light"] .reader-theme-option .reader-nav-tooltip',
    );
  });
});
