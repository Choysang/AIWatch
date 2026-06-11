"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

type ViewKind = "detail" | "source";
const READ_EVENTS_KEY = "aiwatch:read-events:v1";
const EVENT_READ_EVENT = "aiwatch:event-read";

function readEventIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_EVENTS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function hasReadEvent(eventId: string): boolean {
  return readEventIds().has(eventId);
}

function markEventRead(eventId: string): void {
  try {
    const ids = readEventIds();
    ids.add(eventId);
    window.localStorage.setItem(READ_EVENTS_KEY, JSON.stringify([...ids].slice(-1000)));
  } catch {
    // Reading state is only a local UI hint.
  }
  window.dispatchEvent(new CustomEvent(EVENT_READ_EVENT, { detail: { eventId } }));
}

function postEventView(eventId: string, kind: ViewKind): void {
  const url = `/api/events/${encodeURIComponent(eventId)}/views`;
  const body = JSON.stringify({ kind });
  try {
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // View counting should never block opening the story.
  }
  try {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore unsupported keepalive/fetch edge cases.
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(target.closest("a,button,input,textarea,select,summary,details"))
    : false;
}

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function navigateToDetail(href: string): void {
  window.location.assign(new URL(href, window.location.href).href);
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
  const [read, setRead] = useState(false);

  useEffect(() => {
    setRead(hasReadEvent(eventId));
    const onRead = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (detail?.eventId === eventId) setRead(true);
    };
    window.addEventListener(EVENT_READ_EVENT, onRead);
    return () => window.removeEventListener(EVENT_READ_EVENT, onRead);
  }, [eventId]);

  return (
    <article
      id={`event-${eventId}`}
      data-event-id={eventId}
      className={`card ${read ? "card--read" : ""}`}
      tabIndex={-1}
      title="双击查看完整内容和评论"
      onDoubleClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        markEventRead(eventId);
        postEventView(eventId, "detail");
        navigateToDetail(detailHref);
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
      onClick={() => {
        markEventRead(eventId);
        postEventView(eventId, "source");
      }}
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
  return (
    <a
      href={href}
      className="detail-link"
      onClick={(e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        markEventRead(eventId);
        postEventView(eventId, "detail");
        navigateToDetail(href);
      }}
    >
      {children}
    </a>
  );
}
