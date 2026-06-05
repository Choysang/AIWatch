// Inline feed comments (SP3 point C). A toggle at the bottom of every feed card that
// expands the discussion in place — top-level comments + a composer — without leaving the
// feed. Comments are lazy-loaded (GET /api/events/[id]/comments) on first expand, so a feed
// of N cards costs zero comment queries until a reader opts in. The event detail page remains
// the authoritative full view (all sections, server-computed viewer-like state); this inline
// view starts every like at the un-liked glyph and lets the idempotent toggle reconcile.

"use client";

import { useCallback, useEffect, useState } from "react";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import type { CommentSort } from "@/db/queries/comments";
import { CommentComposer } from "./comment-composer";
import { CommentItem, type CommentView } from "./comment-item";

interface PublicComment {
  id: string;
  body: string;
  isExpert: boolean;
  likeCount: number;
  createdAt: string;
  replies?: PublicComment[];
}

interface CommentsPayload {
  sort: CommentSort;
  items: PublicComment[];
}

function toView(c: PublicComment): CommentView {
  return {
    id: c.id,
    body: c.body,
    isExpert: c.isExpert,
    likeCount: c.likeCount,
    liked: false, // inline view has no server-computed viewer state; toggle reconciles
    createdAtLabel: formatDateTime(c.createdAt),
    replies: (c.replies ?? []).map(toView),
  };
}

const POLL_MS = 15_000;

export function InlineComments({ eventId }: { eventId: string }) {
  const m = messages.comments;
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<CommentSort>("latest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<PublicComment[] | null>(null);

  const load = useCallback(async (nextSort = sort, showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/comments?sort=${nextSort}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) throw new Error(`comments fetch failed: ${res.status}`);
      const data = (await res.json()) as CommentsPayload;
      setItems(data.items ?? []);
    } catch {
      setError(true);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [eventId, sort]);

  const onToggle = useCallback(() => {
    setOpen((wasOpen) => !wasOpen);
  }, []);

  useEffect(() => {
    if (open) void load(sort, true);
  }, [load, open, sort]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(sort);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, open, sort]);

  // Once loaded, show the count even when collapsed so readers can gauge activity.
  const count = items ? items.length : null;
  const toggleLabel = open
    ? m.inlineCollapse
    : count !== null
      ? `${count} ${m.inlineCountSuffix}`
      : m.inlineToggle;

  return (
    <div className="inline-comments">
      <button
        type="button"
        className="inline-comments-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span aria-hidden="true">💬</span> {toggleLabel}
      </button>

      {open && (
        <div className="inline-comments-panel">
          <CommentComposer eventId={eventId} refreshOnSubmit={false} onSubmitted={load} />

          {loading && <p className="inline-comments-status">{m.inlineLoading}</p>}
          {error && <p className="inline-comments-status">{m.inlineError}</p>}

          {items && !loading && !error && (
            <InlineList
              eventId={eventId}
              sort={sort}
              items={items}
              onSortChange={setSort}
              onChanged={() => void load(sort, true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InlineList({
  eventId,
  sort,
  items,
  onSortChange,
  onChanged,
}: {
  eventId: string;
  sort: CommentSort;
  items: PublicComment[];
  onSortChange: (sort: CommentSort) => void;
  onChanged: () => void;
}) {
  const m = messages.comments;

  if (items.length === 0) return <p className="inline-comments-status">{m.empty}</p>;

  return (
    <>
      <div className="comments-sort inline" role="group" aria-label={m.sortLabel}>
        {(["latest", "hot"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={sort === value ? "is-active" : ""}
            aria-pressed={sort === value}
            onClick={() => onSortChange(value)}
          >
            {m.sort[value]}
          </button>
        ))}
      </div>
      <div className="comment-block">
        <ul>
          {items.map((c) => (
            <CommentItem
              key={c.id}
              eventId={eventId}
              comment={toView(c)}
              canReply
              refreshOnSubmit={false}
              onChanged={onChanged}
            />
          ))}
        </ul>
      </div>
    </>
  );
}
