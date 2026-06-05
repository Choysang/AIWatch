// Client-side comments panel: one list, latest/hot sorting, and lightweight polling.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "@/app/_lib/format";
import type { CommentSort } from "@/db/queries/comments";
import { messages } from "@/i18n";
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

interface CommentsPanelProps {
  eventId: string;
  initialSort: CommentSort;
  initialComments: CommentView[];
  likedIds: string[];
}

const POLL_MS = 15_000;

function toView(c: PublicComment, likedIds: Set<string>): CommentView {
  return {
    id: c.id,
    body: c.body,
    isExpert: c.isExpert,
    likeCount: c.likeCount,
    liked: likedIds.has(c.id),
    createdAtLabel: formatDateTime(c.createdAt),
    replies: (c.replies ?? []).map((r) => toView(r, likedIds)),
  };
}

export function CommentsPanel({
  eventId,
  initialSort,
  initialComments,
  likedIds,
}: CommentsPanelProps) {
  const m = messages.comments;
  const likedSet = useMemo(() => new Set(likedIds), [likedIds]);
  const [sort, setSort] = useState<CommentSort>(initialSort);
  const [items, setItems] = useState<CommentView[]>(initialComments);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const didMount = useRef(false);

  const load = useCallback(
    async (nextSort = sort, showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const res = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/comments?sort=${nextSort}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        if (!res.ok) throw new Error(`comments fetch failed: ${res.status}`);
        const data = (await res.json()) as CommentsPayload;
        setItems((data.items ?? []).map((c) => toView(c, likedSet)));
        setError(false);
      } catch {
        setError(true);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [eventId, likedSet, sort],
  );

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    void load(sort, true);
  }, [load, sort]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(sort);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, sort]);

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <div className="comments-header">
        <h2 id="comments-heading">{m.heading}</h2>
        <div className="comments-sort" role="group" aria-label={m.sortLabel}>
          {(["latest", "hot"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={sort === value ? "is-active" : ""}
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
            >
              {m.sort[value]}
            </button>
          ))}
        </div>
      </div>

      <CommentComposer
        eventId={eventId}
        refreshOnSubmit={false}
        onSubmitted={() => void load(sort, true)}
      />

      {error && <p className="comments-empty">{m.pollingError}</p>}
      {loading && <p className="comments-empty">{m.inlineLoading}</p>}

      {items.length > 0 ? (
        <div className="comment-block">
          <ul>
            {items.map((c) => (
              <CommentItem
                key={c.id}
                eventId={eventId}
                comment={c}
                canReply
                refreshOnSubmit={false}
                onChanged={() => void load(sort, true)}
              />
            ))}
          </ul>
        </div>
      ) : (
        !loading && <p className="comments-empty">{m.empty}</p>
      )}
    </section>
  );
}
