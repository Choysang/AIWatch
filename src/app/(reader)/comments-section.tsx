// Comments section (Slice 10 + SP3.1). Server-rendered initial state from
// listEventComments plus client islands: a top-level composer (./comment-composer) and
// per-comment action islands (./comment-item — like + reply + nested replies). Three
// labelled sections per spec lines 465-469:
//   - Expert views
//   - High-quality discussion
//   - Latest comments

import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import type { CommentRow, CommentSections, CommentWithReplies } from "@/db/queries/comments";
import { CommentComposer } from "./comment-composer";
import { CommentItem, type CommentView } from "./comment-item";

interface CommentsSectionProps {
  eventId: string;
  sections: CommentSections;
  /** Comment ids the current viewer has liked (top-level + replies). */
  likedIds: Set<string>;
}

function toView(row: CommentRow, likedIds: Set<string>): CommentView {
  return {
    id: row.id,
    body: row.body,
    isExpert: row.isExpert,
    likeCount: row.likeCount,
    liked: likedIds.has(row.id),
    createdAtLabel: formatDateTime(row.createdAt),
    replies: [],
  };
}

function toViewWithReplies(row: CommentWithReplies, likedIds: Set<string>): CommentView {
  return {
    ...toView(row, likedIds),
    replies: row.replies.map((r) => toView(r, likedIds)),
  };
}

export function CommentsSection({ eventId, sections, likedIds }: CommentsSectionProps) {
  const m = messages.comments;
  const hasAny =
    sections.expertViews.length > 0 ||
    sections.highQuality.length > 0 ||
    sections.latest.length > 0;

  const block = (title: string, items: CommentWithReplies[]) =>
    items.length > 0 ? (
      <CommentBlock
        eventId={eventId}
        title={title}
        items={items.map((c) => toViewWithReplies(c, likedIds))}
      />
    ) : null;

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <h2 id="comments-heading">{m.heading}</h2>

      <CommentComposer eventId={eventId} />

      {block(m.sections.expertViews, sections.expertViews)}
      {block(m.sections.highQuality, sections.highQuality)}
      {sections.latest.length > 0
        ? block(m.sections.latest, sections.latest)
        : !hasAny && <p className="comments-empty">{m.empty}</p>}
    </section>
  );
}

function CommentBlock({
  eventId,
  title,
  items,
}: {
  eventId: string;
  title: string;
  items: CommentView[];
}) {
  return (
    <div className="comment-block">
      <h3>{title}</h3>
      <ul>
        {items.map((c) => (
          <CommentItem key={c.id} eventId={eventId} comment={c} canReply />
        ))}
      </ul>
    </div>
  );
}
