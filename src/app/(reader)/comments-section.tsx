// Comments section (Slice 10 + SP3.1). Server-rendered initial state from
// listEventComments, with a client panel handling sort switches and polling refresh.

import { formatDateTime } from "@/app/_lib/format";
import type { CommentRow, CommentSort, CommentWithReplies } from "@/db/queries/comments";
import { CommentsPanel } from "./comments-panel";
import type { CommentView } from "./comment-item";

interface CommentsSectionProps {
  eventId: string;
  comments: CommentWithReplies[];
  initialSort: CommentSort;
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

export function CommentsSection({
  eventId,
  comments,
  initialSort,
  likedIds,
}: CommentsSectionProps) {
  return (
    <CommentsPanel
      eventId={eventId}
      initialSort={initialSort}
      initialComments={comments.map((c) => toViewWithReplies(c, likedIds))}
      likedIds={[...likedIds]}
    />
  );
}
