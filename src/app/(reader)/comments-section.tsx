// Comments section (Slice 10). Server-rendered initial state from listEventComments
// plus a client-island composer (./comment-composer) that prepends new submissions
// optimistically. Three labelled sections per spec lines 465-469:
//   - Expert views
//   - High-quality discussion
//   - Latest comments

import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import type { CommentSections } from "@/db/queries/comments";
import { CommentComposer } from "./comment-composer";

interface CommentsSectionProps {
  eventId: string;
  sections: CommentSections;
}

interface PublicComment {
  id: string;
  body: string;
  isExpert: boolean;
  createdAt: Date;
}

export function CommentsSection({ eventId, sections }: CommentsSectionProps) {
  const m = messages.comments;
  const hasAny =
    sections.expertViews.length > 0 ||
    sections.highQuality.length > 0 ||
    sections.latest.length > 0;

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <h2 id="comments-heading">{m.heading}</h2>

      <CommentComposer eventId={eventId} />

      {sections.expertViews.length > 0 && (
        <CommentBlock title={m.sections.expertViews} items={sections.expertViews} />
      )}
      {sections.highQuality.length > 0 && (
        <CommentBlock title={m.sections.highQuality} items={sections.highQuality} />
      )}
      {sections.latest.length > 0 ? (
        <CommentBlock title={m.sections.latest} items={sections.latest} />
      ) : (
        !hasAny && <p className="comments-empty">{m.empty}</p>
      )}
    </section>
  );
}

function CommentBlock({ title, items }: { title: string; items: PublicComment[] }) {
  const m = messages.comments;
  return (
    <div className="comment-block">
      <h3>{title}</h3>
      <ul>
        {items.map((c) => (
          <li className="comment-item" key={c.id}>
            <div className="comment-meta">
              {c.isExpert && <span className="badge expert">{m.expertBadge}</span>}
              <time>{formatDateTime(c.createdAt)}</time>
            </div>
            <p className="comment-body">{c.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
