"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

interface PublicItemPeek {
  id?: string;
  published_at?: string | null;
  promoted_at?: string | null;
}

interface PublicItemsPeek {
  items?: PublicItemPeek[];
}

function keyFor(item: PublicItemPeek | undefined): string | null {
  if (!item?.id) return null;
  return `${item.id}:${item.published_at ?? ""}:${item.promoted_at ?? ""}`;
}

export function FeedRefreshIndicator({
  latestKey,
  refreshQuery,
}: {
  latestKey: string | null;
  refreshQuery: string | null;
}) {
  const router = useRouter();
  const [hasNew, setHasNew] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!latestKey || !refreshQuery) return;
    let cancelled = false;
    let inFlight = false;

    const check = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/public/items?${refreshQuery}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as PublicItemsPeek;
        const nextKey = keyFor(data.items?.[0]);
        if (!nextKey || nextKey === latestKey) return;
        if (window.scrollY < 160) {
          startTransition(() => router.refresh());
        } else {
          setHasNew(true);
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(check, 60_000);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [latestKey, refreshQuery, router, startTransition]);

  if (!hasNew) return null;

  return (
    <button
      type="button"
      className="feed-refresh-indicator"
      disabled={isPending}
      onClick={() => {
        setHasNew(false);
        startTransition(() => router.refresh());
      }}
    >
      {isPending ? "正在加载新动态…" : "有新动态，点击加载"}
    </button>
  );
}
