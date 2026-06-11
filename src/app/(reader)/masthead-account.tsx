"use client";

// Masthead account cluster (SP3.2 + SP3.3). Lives in the reader masthead's <nav>. Anonymous
// readers see a single "登录 / 注册" link that returns them to the current page after auth;
// logged-in readers see their name, an optional console link, and sign-out. The notification
// bell is exported separately so the reader page can place it beside the sidebar toggle.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { isConsoleRole } from "@/auth/console-roles";
import { messages } from "@/i18n";

interface NotificationPreviewItem {
  id: string;
  title: string;
  body: string | null;
  eventId: string | null;
}

export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationPreviewItem[] | null>(null);
  const previewLoading = useRef(false);
  const t = messages.account;

  useEffect(() => {
    let cancelled = false;
    router.prefetch("/notifications");
    fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d: { count?: number }) => {
        if (!cancelled) setCount(typeof d.count === "number" ? d.count : 0);
      })
      .catch(() => {
        /* a missing badge is fine; never break the masthead */
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadPreview = useCallback(() => {
    if (items !== null || previewLoading.current) return;
    previewLoading.current = true;
    fetch("/api/notifications/preview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { count: 0, items: [] }))
      .then((d: { count?: number; items?: NotificationPreviewItem[] }) => {
        setCount(typeof d.count === "number" ? d.count : 0);
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {
        setItems([]);
      })
      .finally(() => {
        previewLoading.current = false;
      });
  }, [items]);

  const prepareNotifications = useCallback(() => {
    router.prefetch("/notifications");
    loadPreview();
  }, [loadPreview, router]);

  return (
    <span
      className="masthead-bell-wrap"
      onMouseEnter={prepareNotifications}
      onPointerEnter={prepareNotifications}
      onFocus={prepareNotifications}
    >
      <Link href="/notifications" className="masthead-bell" aria-label={t.notifications}>
        <span aria-hidden="true">🔔</span>
        {count > 0 && (
          <span className="masthead-bell-badge">{count > 99 ? "99+" : count}</span>
        )}
      </Link>
      <span className="masthead-notification-preview" role="status">
        <strong>{count > 0 ? `${count} 条未读` : "暂无未读"}</strong>
        {(items ?? []).slice(0, 3).map((item) => (
          <span key={item.id} className="masthead-notification-item">
            <span>{item.title}</span>
            {item.body && <small>{item.body}</small>}
          </span>
        ))}
      </span>
    </span>
  );
}

export function MastheadAccount() {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const t = messages.account;

  // Avoid a login/logout flicker before the session resolves.
  if (isPending) return null;

  const user = data?.user as { name?: string; email?: string; role?: string } | undefined;

  if (!user) {
    const next = encodeURIComponent(pathname || "/");
    return (
      <Link href={`/login?next=${next}`} className="masthead-account-link">
        {t.signIn}
      </Link>
    );
  }

  async function onSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    setSigningOut(false);
    router.refresh();
  }

  const displayName = user.name || user.email || "";

  return (
    <span className="masthead-account">
      <span className="masthead-account-name">{displayName}</span>
      {isConsoleRole(user.role) && <Link href="/_admin">{t.console}</Link>}
      <button type="button" className="link-button" onClick={onSignOut} disabled={signingOut}>
        {signingOut ? t.signingOut : t.signOut}
      </button>
    </span>
  );
}
