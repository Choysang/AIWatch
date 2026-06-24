// Comment item (SP3.1). Client island rendering one top-level comment with: a like
// button (optimistic toggle → POST /api/comments/[id]/reactions), a reply toggle that
// reveals an inline reply composer (parentId = this comment), and its nested replies.
// Replies are themselves likeable but cannot be replied to (single-level threads).

"use client";

import { useCallback, useState, useTransition } from "react";
import { messages } from "@/i18n";
import { CommentComposer } from "./comment-composer";

export interface CommentView {
  id: string;
  body: string;
  isExpert: boolean;
  likeCount: number;
  liked: boolean;
  createdAtLabel: string;
  replies: CommentView[];
}

interface CommentItemProps {
  eventId: string;
  comment: CommentView;
  /** Top-level comments can be replied to; nested replies cannot. */
  canReply: boolean;
  /**
   * SP3 point C: inline (feed) usage passes false so a reply re-fetches the client list
   * instead of refreshing the whole SSR feed. Detail-page usage keeps the default refresh.
   */
  refreshOnSubmit?: boolean;
  /** SP3 point C: called after a reply is submitted, so an inline list can reload. */
  onChanged?: () => void;
}

async function postCommentLike(commentId: string, op: "add" | "remove"): Promise<number> {
  const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/reactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ op }),
  });
  if (!res.ok) throw new Error(`comment like failed: ${res.status}`);
  const data = (await res.json()) as { likeCount: number };
  return data.likeCount;
}

function CommentLikeButton({ comment }: { comment: CommentView }) {
  const m = messages.comments;
  const [optimistic, setOptimistic] = useState<{ liked: boolean; count: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const liked = optimistic?.liked ?? comment.liked;
  const count = optimistic?.count ?? comment.likeCount;

  const toggle = useCallback(() => {
    const prevLiked = liked;
    const prevCount = count;
    const op = prevLiked ? "remove" : "add";
    setOptimistic({ liked: !prevLiked, count: Math.max(0, prevCount + (prevLiked ? -1 : 1)) });
    startTransition(() => {
      postCommentLike(comment.id, op)
        .then((serverCount) => setOptimistic({ liked: op === "add", count: serverCount }))
        .catch(() => {
          setOptimistic(null);
        });
    });
  }, [comment.id, liked, count]);

  return (
    <button
      type="button"
      className={`comment-like ${liked ? "on" : ""}`}
      aria-pressed={liked}
      aria-label={liked ? m.liked : m.like}
      disabled={isPending}
      onClick={toggle}
    >
      <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
      <span className="count">{count}</span>
    </button>
  );
}

export function CommentItem({
  eventId,
  comment,
  canReply,
  refreshOnSubmit = true,
  onChanged,
}: CommentItemProps) {
  const m = messages.comments;
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <li className="comment-item">
      <div className="comment-meta">
        {comment.isExpert && <span className="badge expert">{m.expertBadge}</span>}
        <time>{comment.createdAtLabel}</time>
      </div>
      <p className="comment-body">{comment.body}</p>
      <div className="comment-actions">
        <CommentLikeButton
          key={`${comment.id}:${comment.liked}:${comment.likeCount}`}
          comment={comment}
        />
        {canReply && (
          <button
            type="button"
            className="comment-reply-toggle"
            aria-expanded={replyOpen}
            onClick={() => setReplyOpen((v) => !v)}
          >
            {m.reply}
          </button>
        )}
      </div>

      {canReply && replyOpen && (
        <CommentComposer
          eventId={eventId}
          parentId={comment.id}
          variant="reply"
          refreshOnSubmit={refreshOnSubmit}
          onSubmitted={() => {
            setReplyOpen(false);
            onChanged?.();
          }}
        />
      )}

      {comment.replies.length > 0 && (
        <ul className="comment-replies">
          {comment.replies.map((r) => (
            <CommentItem
              key={r.id}
              eventId={eventId}
              comment={r}
              canReply={false}
              refreshOnSubmit={refreshOnSubmit}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
