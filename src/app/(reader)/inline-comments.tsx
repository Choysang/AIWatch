// Inline feed comments (SP3 point C). A toggle at the bottom of every feed card that
// expands the discussion in place — top-level comments + a composer — without leaving the
// feed. Comments are lazy-loaded (GET /api/events/[id]/comments) on first expand, so a feed
// of N cards costs zero comment queries until a reader opts in. The event detail page remains
// the authoritative full view (all sections, server-computed viewer-like state); this inline
// view starts every like at the un-liked glyph and lets the idempotent toggle reconcile.

"use client";

import { useCallback, useState } from "react";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
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

interface CommentSectionsPayload {
  expertViews: PublicComment[];
  highQuality: PublicComment[];
  latest: PublicComment[];
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

function countTopLevel(s: CommentSectionsPayload): number {
  return s.expertViews.length + s.highQuality.length + s.latest.length;
}

export function InlineComments({ eventId }: { eventId: string }) {
  const m = messages.comments;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [sections, setSections] = useState<CommentSectionsPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comments`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`comments fetch failed: ${res.status}`);
      const data = (await res.json()) as CommentSectionsPayload;
      setSections(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const onToggle = useCallback(() => {
    setOpen((wasOpen) => {
      // Fetch on first expand only; reopening reuses the cached list (a submit reloads it).
      if (!wasOpen && sections === null && !loading) void load();
      return !wasOpen;
    });
  }, [sections, loading, load]);

  // Once loaded, show the count even when collapsed so readers can gauge activity.
  const count = sections ? countTopLevel(sections) : null;
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

          {sections && !loading && !error && (
            <InlineSections eventId={eventId} sections={sections} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}

function InlineSections({
  eventId,
  sections,
  onChanged,
}: {
  eventId: string;
  sections: CommentSectionsPayload;
  onChanged: () => void;
}) {
  const m = messages.comments;
  const groups: Array<[string, PublicComment[]]> = [
    [m.sections.expertViews, sections.expertViews],
    [m.sections.highQuality, sections.highQuality],
    [m.sections.latest, sections.latest],
  ];
  const hasAny = groups.some(([, items]) => items.length > 0);

  if (!hasAny) return <p className="inline-comments-status">{m.empty}</p>;

  return (
    <>
      {groups.map(([title, items]) =>
        items.length > 0 ? (
          <div className="comment-block" key={title}>
            <h3>{title}</h3>
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
        ) : null,
      )}
    </>
  );
}
