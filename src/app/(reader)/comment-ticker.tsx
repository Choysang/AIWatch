// Rotating "hot comments" strip on a feed card. Cycles through the top reader comments
// one at a time (small type) so a card hints at the discussion without expanding. Pure
// client island: a single interval swaps the visible line with a short cross-fade. Pauses
// on reduced-motion (shows the first line statically). No data fetching — lines arrive as
// props from the SSR page (getTopCommentsForEvents).

"use client";

import { useEffect, useState } from "react";

const ROTATE_MS = 4200;

interface CommentTickerProps {
  comments: string[];
}

export function CommentTicker({ comments }: CommentTickerProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (comments.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % comments.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [comments.length]);

  if (comments.length === 0) return null;
  const current = comments[index] ?? comments[0];

  return (
    <div className="comment-ticker" aria-label="热门评论">
      <span className="comment-ticker-quote" aria-hidden="true">
        ❝
      </span>
      <span key={index} className="comment-ticker-line">
        {current}
      </span>
      {comments.length > 1 && (
        <span className="comment-ticker-dots" aria-hidden="true">
          {comments.map((_, i) => (
            <span key={i} className={`tick-dot ${i === index ? "on" : ""}`} />
          ))}
        </span>
      )}
    </div>
  );
}
