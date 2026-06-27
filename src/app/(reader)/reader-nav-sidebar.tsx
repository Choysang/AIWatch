"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { isConsoleRole } from "@/auth/console-roles";
import { messages } from "@/i18n";

type ReaderThemeMode = "dark" | "system" | "light";
type NavGroupId = "content" | "access" | "more";

const READER_THEME_STORAGE_KEY = "aiwatch:reader-theme-mode";
const NAV_GROUP_STORAGE_KEY = "aiwatch:reader-nav-groups";
const READER_THEME_STORE_EVENT = "aiwatch:reader-theme-mode";
const NAV_GROUP_STORE_EVENT = "aiwatch:reader-nav-groups";
const DEFAULT_READER_THEME_MODE: ReaderThemeMode = "system";
const DEFAULT_NAV_GROUP_OPEN: Record<NavGroupId, boolean> = {
  content: true,
  access: true,
  more: true,
};

const READER_THEME_OPTIONS: { name: ReaderThemeMode; label: string }[] = [
  { name: "dark", label: "夜间" },
  { name: "system", label: "跟随系统" },
  { name: "light", label: "日间" },
];

function accountInitial(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || "U";
}

function isReaderThemeMode(value: string | null): value is ReaderThemeMode {
  return value === "dark" || value === "system" || value === "light";
}

function readReaderThemeMode(): ReaderThemeMode {
  try {
    const storedMode = localStorage.getItem(READER_THEME_STORAGE_KEY);
    return isReaderThemeMode(storedMode) ? storedMode : DEFAULT_READER_THEME_MODE;
  } catch {
    return DEFAULT_READER_THEME_MODE;
  }
}

function effectiveReaderTheme(mode: ReaderThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyReaderTheme(mode: ReaderThemeMode) {
  document.documentElement.dataset.readerThemeMode = mode;
  document.documentElement.dataset.readerTheme = effectiveReaderTheme(mode);
}

function readNavGroupSnapshot(): string {
  try {
    return localStorage.getItem(NAV_GROUP_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function parseNavGroupSnapshot(snapshot: string): Record<NavGroupId, boolean> {
  try {
    const parsed = JSON.parse(snapshot || "{}") as Partial<Record<NavGroupId, boolean>>;
    return { ...DEFAULT_NAV_GROUP_OPEN, ...parsed };
  } catch {
    return DEFAULT_NAV_GROUP_OPEN;
  }
}

function subscribeStorage(eventName: string, onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === eventName) onStoreChange();
  };
  window.addEventListener(eventName, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function isTabletRailViewport(): boolean {
  return window.innerWidth > 760 && window.innerWidth < 960;
}

function subscribeReaderViewport(onStoreChange: () => void): () => void {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function ReaderNavIcon({
  name,
}: {
  name: "content" | "boards" | "reports" | "me" | "feedback" | "source" | "about";
}) {
  return (
    <svg
      className="reader-nav-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "content" && (
        <>
          <path d="M8 4h9.5v14H8z" />
          <path d="M6 6H4.5v14H14v-2" />
          <path d="M11 9h3.5" />
          <path d="M11 12h3.5" />
        </>
      )}
      {name === "boards" && (
        <>
          <rect x="3.5" y="4.5" width="6.6" height="15" rx="1.4" />
          <rect x="13.9" y="4.5" width="6.6" height="9" rx="1.4" />
        </>
      )}
      {name === "reports" && (
        <>
          <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h4.5v16H7a2.5 2.5 0 0 0-2.5 2z" />
          <path d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-4.5v16H17a2.5 2.5 0 0 1 2.5 2z" />
        </>
      )}
      {name === "me" && (
        <>
          <circle cx="12" cy="8" r="3.1" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="M18.3 5.4 19.4 4l1.1 1.4" />
        </>
      )}
      {name === "feedback" && (
        <>
          <path d="M5 5.5h14v9.5H9l-4 3.5z" />
          <path d="M8.5 9h7" />
          <path d="M8.5 12h4.5" />
        </>
      )}
      {name === "source" && (
        <>
          <path d="M5 6.5h14" />
          <path d="M7 6.5v12" />
          <path d="M17 6.5v12" />
          <path d="M8.5 11.5h7" />
          <path d="M10.5 15.5h3" />
        </>
      )}
      {name === "about" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </>
      )}
    </svg>
  );
}

function ReaderThemeIcon({ name }: { name: ReaderThemeMode }) {
  return (
    <svg
      className="reader-theme-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "dark" && <path d="M20 14.6A7.5 7.5 0 0 1 9.4 4 7.8 7.8 0 1 0 20 14.6z" />}
      {name === "system" && (
        <>
          <rect x="4.5" y="5.5" width="15" height="10.5" rx="1.6" />
          <path d="M9 19h6" />
          <path d="M12 16v3" />
        </>
      )}
      {name === "light" && (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.8v2" />
          <path d="M12 19.2v2" />
          <path d="m4.5 4.5 1.4 1.4" />
          <path d="m18.1 18.1 1.4 1.4" />
          <path d="M2.8 12h2" />
          <path d="M19.2 12h2" />
          <path d="m4.5 19.5 1.4-1.4" />
          <path d="m18.1 5.9 1.4-1.4" />
        </>
      )}
    </svg>
  );
}

function ReaderThemeSwitch() {
  const mode = useSyncExternalStore(
    (onStoreChange) => subscribeStorage(READER_THEME_STORE_EVENT, onStoreChange),
    readReaderThemeMode,
    () => DEFAULT_READER_THEME_MODE,
  );

  useEffect(() => {
    applyReaderTheme(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyReaderTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function chooseMode(nextMode: ReaderThemeMode) {
    localStorage.setItem(READER_THEME_STORAGE_KEY, nextMode);
    window.dispatchEvent(new Event(READER_THEME_STORE_EVENT));
    applyReaderTheme(nextMode);
  }

  return (
    <div className="reader-theme-switch" role="radiogroup" aria-label="浏览模式">
      {READER_THEME_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.name}
          className={`reader-theme-option ${mode === option.name ? "is-active" : ""}`}
          role="radio"
          aria-checked={mode === option.name}
          aria-label={option.label}
          title={option.label}
          onClick={() => chooseMode(option.name)}
        >
          <ReaderThemeIcon name={option.name} />
          <span className="reader-nav-tooltip">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function ReaderNavGroup({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: NavGroupId;
  label: string;
  open: boolean;
  onToggle: (id: NavGroupId) => void;
  children: ReactNode;
}) {
  return (
    <section className="reader-nav-group">
      <button
        type="button"
        className="reader-nav-group-toggle"
        aria-expanded={open}
        data-tooltip={`${open ? "收起" : "展开"}${label}导航`}
        onClick={() => onToggle(id)}
      >
        <span className="reader-nav-group-label">{label}</span>
        <span className="reader-nav-group-arrow" aria-hidden="true">
          {open ? "⌄" : "›"}
        </span>
      </button>
      <div className="reader-nav-group-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function ReaderNavAccount() {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const t = messages.account;

  if (isPending) {
    return (
      <div className="reader-nav-account is-loading" aria-hidden="true">
        <span className="reader-nav-avatar">
          <span className="reader-nav-tooltip">加载中</span>
        </span>
        <span className="reader-nav-account-text">
          <strong>加载中</strong>
          <small>正在读取账号</small>
        </span>
      </div>
    );
  }

  const user =
    data?.user as { name?: string; email?: string; role?: string } | undefined;

  if (!user) {
    const next = encodeURIComponent(pathname || "/");
    return (
      <Link href={`/login?next=${next}`} className="reader-nav-account">
        <span className="reader-nav-avatar" aria-hidden="true">
          IN
          <span className="reader-nav-tooltip">登录 / 注册</span>
        </span>
        <span className="reader-nav-account-text">
          <strong>登录 / 注册</strong>
          <small>登录后可评论信源卡片</small>
        </span>
      </Link>
    );
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const displayName = user.name || user.email || "已登录";

  return (
    <div className="reader-nav-account">
      <span className="reader-nav-avatar" aria-hidden="true">
        {accountInitial(displayName)}
        <span className="reader-nav-tooltip">{displayName}</span>
      </span>
      <span className="reader-nav-account-text">
        <strong title={displayName}>{displayName}</strong>
        <small>{user.email || "已登录账号"}</small>
      </span>
      <span className="reader-nav-account-actions">
        {isConsoleRole(user.role) && <Link href="/_admin">{t.console}</Link>}
        <button type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? t.signingOut : t.signOut}
        </button>
      </span>
    </div>
  );
}

export function ReaderNavSidebar() {
  const pathname = usePathname();
  const shouldCollapseByViewport = useSyncExternalStore(
    subscribeReaderViewport,
    isTabletRailViewport,
    () => false,
  );
  const pathKey = pathname ?? "";
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const collapsed = collapsedOverride ?? shouldCollapseByViewport;
  const reportExpanded = pathname?.startsWith("/daily") || pathname?.startsWith("/reports") || false;
  const meExpanded = pathname?.startsWith("/me") ?? false;
  const navGroupSnapshot = useSyncExternalStore(
    (onStoreChange) => subscribeStorage(NAV_GROUP_STORE_EVENT, onStoreChange),
    readNavGroupSnapshot,
    () => "",
  );
  const navGroupOpen = useMemo(() => parseNavGroupSnapshot(navGroupSnapshot), [navGroupSnapshot]);
  // Mobile (≤760px) renders the sidebar as an off-canvas drawer: hidden by default so it
  // never overlaps content, opened by the floating button below, dismissed by the scrim or
  // by navigating. Desktop ignores this and uses `collapsed` (full ↔ rail).
  const [mobileDrawer, setMobileDrawer] = useState({ open: false, pathKey });
  const mobileOpen = mobileDrawer.open && mobileDrawer.pathKey === pathKey;

  function setMobileOpen(open: boolean) {
    setMobileDrawer({ open, pathKey });
  }

  function toggleNavGroup(id: NavGroupId) {
    const current = parseNavGroupSnapshot(readNavGroupSnapshot());
    const next = { ...current, [id]: !current[id] };
    localStorage.setItem(NAV_GROUP_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(NAV_GROUP_STORE_EVENT));
  }

  return (
    <>
      <button
        type="button"
        className="reader-nav-fab"
        aria-label="打开导航菜单"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        <span className="reader-nav-fab-icon" aria-hidden="true">
          <span className="reader-nav-fab-line" />
          <span className="reader-nav-fab-line" />
          <span className="reader-nav-fab-line" />
        </span>
        <span className="reader-nav-fab-label">AI HOT</span>
      </button>
      <div
        className={`reader-nav-scrim ${mobileOpen ? "is-open" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`reader-nav-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
        aria-label="AIWatch 主侧栏"
      >
      <div className="reader-nav-top">
        <button
          type="button"
          className="reader-nav-brand"
          aria-label={collapsed ? "展开主侧栏" : "收起主侧栏"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsedOverride(!collapsed)}
        >
          <span className="reader-nav-mark">
            AI
            <span className="reader-nav-tooltip" aria-hidden="true">AIWatch</span>
          </span>
          <span className="reader-nav-text">AIWatch</span>
        </button>
      </div>

      <nav className="reader-nav-sections" aria-label="读者导航">
        <ReaderNavGroup id="content" label="内容" open={navGroupOpen.content} onToggle={toggleNavGroup}>
        <Link href="/" className="reader-nav-item" aria-label="内容广场">
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="content" />
            <span className="reader-nav-tooltip">内容广场</span>
          </span>
          <span className="reader-nav-text">
            <strong>内容广场</strong>
            <small>首页展示的全部动态</small>
          </span>
        </Link>

        <Link
          href="/daily"
          className="reader-nav-item"
          aria-label="每日速览"
          aria-expanded={reportExpanded}
        >
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="reports" />
            <span className="reader-nav-tooltip">每日速览</span>
          </span>
          <span className="reader-nav-text">
            <strong>每日速览</strong>
            <small>日、周、月报内容</small>
          </span>
        </Link>
        <div className="reader-nav-report-subitems" aria-label="速览周期" hidden={!reportExpanded}>
          <Link href="/daily">日报</Link>
          <Link href="/reports/weekly">周报</Link>
          <Link href="/reports/monthly">月报</Link>
        </div>
        </ReaderNavGroup>

        <ReaderNavGroup id="access" label="接入" open={navGroupOpen.access} onToggle={toggleNavGroup}>
        <Link href="/boards" className="reader-nav-item" aria-label={messages.nav.boards}>
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="boards" />
            <span className="reader-nav-tooltip">{messages.nav.boards}</span>
          </span>
          <span className="reader-nav-text">
            <strong>{messages.nav.boards}</strong>
            <small>关注主题 · 个人定制</small>
          </span>
        </Link>
        <Link href="/aiwatch-skill" className="reader-nav-item" aria-label="Agent 接入">
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="source" />
            <span className="reader-nav-tooltip">Agent 接入</span>
          </span>
          <span className="reader-nav-text">
            <strong>Agent 接入</strong>
            <small>Skill、RSS、API</small>
          </span>
        </Link>
        </ReaderNavGroup>

        <ReaderNavGroup id="more" label="更多" open={navGroupOpen.more} onToggle={toggleNavGroup}>
        <Link
          href="/me/likes"
          className="reader-nav-item"
          aria-label="我的互动"
          aria-expanded={meExpanded}
        >
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="me" />
            <span className="reader-nav-tooltip">我的互动</span>
          </span>
          <span className="reader-nav-text">
            <strong>我的互动</strong>
            <small>点赞、收藏、评论</small>
          </span>
        </Link>
        <div className="reader-nav-me-subitems" aria-label="我的互动分类" hidden={!meExpanded}>
          <Link href="/me/likes">点赞</Link>
          <Link href="/me/stars">收藏</Link>
          <Link href="/me/comments">评论</Link>
        </div>

        <Link href="/feedback" className="reader-nav-item" aria-label="意见反馈">
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="feedback" />
            <span className="reader-nav-tooltip">意见反馈</span>
          </span>
          <span className="reader-nav-text">
            <strong>意见反馈</strong>
            <small>告诉我们哪里不好用</small>
          </span>
        </Link>

        <Link href="/recommend-source" className="reader-nav-item" aria-label="推荐信源">
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="source" />
            <span className="reader-nav-tooltip">推荐信源</span>
          </span>
          <span className="reader-nav-text">
            <strong>推荐信源</strong>
            <small>提交值得跟踪的信息源</small>
          </span>
        </Link>
        </ReaderNavGroup>
      </nav>

      <ReaderThemeSwitch />
      <div className="reader-nav-bottom">
        <Link href="/about" className="reader-nav-item reader-nav-about" aria-label="关于">
          <span className="reader-nav-icon" aria-hidden="true">
            <ReaderNavIcon name="about" />
            <span className="reader-nav-tooltip">关于</span>
          </span>
          <span className="reader-nav-text">
            <strong>关于</strong>
          </span>
        </Link>
        <ReaderNavAccount />
      </div>
      </aside>
    </>
  );
}
