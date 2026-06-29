"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

interface PublicItemPeek {
  id?: string;
  published_at?: string | null;
  promoted_at?: string | null;
}

interface PublicItemsPeek {
  items?: PublicItemPeek[];
}

const LIVE_REFRESH_PARAM = "_live";
const POLL_INTERVAL_MS = 30_000;

function keyFor(item: PublicItemPeek | undefined): string | null {
  if (!item?.id) return null;
  return `${item.id}:${item.published_at ?? ""}:${item.promoted_at ?? ""}`;
}

function refreshedHref(pathname: string, searchParams: { toString(): string }): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete(LIVE_REFRESH_PARAM);
  params.set(LIVE_REFRESH_PARAM, String(Date.now()));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function FeedRefreshIndicator({
  latestKey,
  refreshQuery,
}: {
  latestKey: string | null;
  refreshQuery: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasNew, setHasNew] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadFresh = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    startTransition(() => {
      router.replace(refreshedHref(pathname, searchParams), { scroll: true });
    });
  }, [pathname, router, searchParams, startTransition]);

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
          loadFresh();
        } else {
          setHasNew(true);
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [latestKey, refreshQuery, loadFresh]);

  if (!hasNew) return null;

  return (
    <button
      type="button"
      className="feed-refresh-indicator"
      disabled={isPending}
      onClick={() => {
        setHasNew(false);
        loadFresh();
      }}
    >
      {isPending ? "正在加载新动态…" : "有新动态，点击加载"}
    </button>
  );
}
