"use client";

// On open, mark every unread notification read (SP3.3 design: "点开标记已读"). One fire-and-
// forget POST, then refresh so the masthead bell badge clears. The SSR snapshot already
// rendered the unread highlights, so the reader still sees which were new on this visit.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function MarkAllRead({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (!hasUnread || done.current) return;
    done.current = true;
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
      .then(() => router.refresh())
      .catch(() => {
        /* badge will retry on next navigation */
      });
  }, [hasUnread, router]);

  return null;
}
