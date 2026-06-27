"use client";

// Masthead account cluster (SP3.2 + SP3.3). Lives in the reader masthead's <nav>. Anonymous
// readers see a single "登录 / 注册" link that returns them to the current page after auth;
// logged-in readers see their name, an optional console link, and sign-out.

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { isConsoleRole } from "@/auth/console-roles";
import { messages } from "@/i18n";

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
    try {
      await authClient.signOut();
      router.refresh();
    } finally {
      setSigningOut(false);
    }
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
