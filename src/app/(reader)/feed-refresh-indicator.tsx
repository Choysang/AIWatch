"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

interface PublicItemPeek {
  id?: string;
  published_at?: string | null;
  promoted_at?: string | null;
  created_at?: string | null;
  sort_at?: string | null;
}

interface PublicItemsPeek {
  items?: PublicItemPeek[];
}

const LIVE_REFRESH_PARAM = "_live";
const POLL_INTERVAL_MS = 30_000;
const REFRESH_FEEDBACK_TIMEOUT_MS = 6_000;

function keyFor(item: PublicItemPeek | undefined): string | null {
  if (!item?.id) return null;
  return `${item.id}:${item.sort_at ?? item.published_at ?? item.promoted_at ?? item.created_at ?? ""}`;
}

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
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
  latestSortAt,
  refreshQuery,
  refreshEndpoint = "/api/public/items",
}: {
  latestKey: string | null;
  latestSortAt: string | null;
  refreshQuery: string | null;
  refreshEndpoint?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasNew, setHasNew] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const reloadingFromKeyRef = useRef<string | null>(null);

  const loadFresh = useCallback(() => {
    reloadingFromKeyRef.current = latestKey;
    setIsReloading(true);
    window.scrollTo({ top: 0, behavior: "auto" });
    startTransition(() => {
      router.replace(refreshedHref(pathname, searchParams), { scroll: true });
      router.refresh();
    });
  }, [latestKey, pathname, router, searchParams, startTransition]);

  useEffect(() => {
    if (!isReloading) return;
    const timer = window.setTimeout(() => setIsReloading(false), REFRESH_FEEDBACK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isReloading]);

  useEffect(() => {
    if (!isReloading) return;
    if (!reloadingFromKeyRef.current || latestKey === reloadingFromKeyRef.current) return;
    setIsReloading(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [latestKey, isReloading]);

  useEffect(() => {
    if (!latestKey || !refreshQuery) return;
    let cancelled = false;
    let inFlight = false;

    const check = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`${refreshEndpoint}?${refreshQuery}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as PublicItemsPeek;
        const nextItem = data.items?.[0];
        const nextKey = keyFor(nextItem);
        if (!nextKey || nextKey === latestKey) return;
        const nextTime = timeMs(nextItem?.sort_at ?? nextItem?.published_at ?? nextItem?.promoted_at ?? nextItem?.created_at);
        const latestTime = timeMs(latestSortAt);
        if (nextTime === null || latestTime === null || nextTime <= latestTime) return;
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
  }, [latestKey, latestSortAt, refreshQuery, refreshEndpoint, loadFresh]);

  const loading = isPending || isReloading;

  if (!hasNew && !loading) return null;

  return (
    <button
      type="button"
      className="feed-refresh-indicator"
      disabled={loading}
      onClick={() => {
        setHasNew(false);
        loadFresh();
      }}
    >
      {loading ? "正在加载新动态…" : "有新动态，点击加载"}
    </button>
  );
}
