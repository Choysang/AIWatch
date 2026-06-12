"use client";

// On open, mark every unread notification read (SP3.3 design: "点开标记已读"). One fire-and-
// forget POST. The SSR snapshot already rendered the unread highlights, so the reader still
// sees which were new on this visit; the bell count refreshes the next time it mounts.

import { useEffect, useRef } from "react";

export function MarkAllRead({ hasUnread }: { hasUnread: boolean }) {
  const done = useRef(false);

  useEffect(() => {
    if (!hasUnread || done.current) return;
    done.current = true;
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
      .catch(() => {
        /* badge will retry on next navigation */
      });
  }, [hasUnread]);

  return null;
}
