"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

type ViewKind = "detail" | "source";

function postEventView(eventId: string, kind: ViewKind): void {
  const url = `/api/events/${encodeURIComponent(eventId)}/views`;
  const body = JSON.stringify({ kind });
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(target.closest("a,button,input,textarea,select,summary,details"))
    : false;
}

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function EventCardShell({
  eventId,
  detailHref,
  children,
}: {
  eventId: string;
  detailHref: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <article
      className="card"
      title="双击查看完整内容和评论"
      onDoubleClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        postEventView(eventId, "detail");
        router.push(detailHref);
      }}
    >
      {children}
    </article>
  );
}

export function TrackableOriginalLink({
  eventId,
  href,
  children,
}: {
  eventId: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => postEventView(eventId, "source")}
    >
      {children}
    </a>
  );
}

export function TrackableDetailLink({
  eventId,
  href,
  children,
}: {
  eventId: string;
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <a
      href={href}
      className="detail-link"
      onClick={(e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        postEventView(eventId, "detail");
        router.push(href);
      }}
    >
      {children}
    </a>
  );
}
