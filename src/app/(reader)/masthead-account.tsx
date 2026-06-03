"use client";

// Masthead account cluster (SP3.2 + SP3.3). Lives in the reader masthead's <nav>. Anonymous
// readers see a single "登录 / 注册" link that returns them to the current page after auth;
// logged-in readers see a notification bell (with unread badge), their name, an optional
// console link, and sign-out. Fully client-side: the session comes from better-auth's
// useSession and the unread count is fetched on mount (refreshes on every navigation — not
// real-time, matching the SP3 design's "SSR + 进页刷新" decision).

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { isConsoleRole } from "@/auth/console-roles";
import { messages } from "@/i18n";

function NotificationBell() {
  const [count, setCount] = useState(0);
  const t = messages.account;

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  return (
    <Link href="/notifications" className="masthead-bell" aria-label={t.notifications}>
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span className="masthead-bell-badge">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
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
      <NotificationBell />
      <span className="masthead-account-name">{displayName}</span>
      {isConsoleRole(user.role) && <Link href="/_admin">{t.console}</Link>}
      <button type="button" className="link-button" onClick={onSignOut} disabled={signingOut}>
        {signingOut ? t.signingOut : t.signOut}
      </button>
    </span>
  );
}
