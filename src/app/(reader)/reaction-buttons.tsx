// Reaction buttons (Slice 8): two toggle buttons (like / star) per event card.
// Optimistic updates with rollback on failure. Calls POST /api/events/[id]/reactions.
// Identity comes from the request cookie/session — this component just sends ops.

"use client";

import { useCallback, useState, useTransition } from "react";
import { messages } from "@/i18n";

interface ReactionButtonsProps {
  eventId: string;
  initialLikeCount: number;
  initialStarCount: number;
  initialLiked: boolean;
  initialStarred: boolean;
}

type Kind = "like" | "star";

interface State {
  likeCount: number;
  starCount: number;
  liked: boolean;
  starred: boolean;
}

interface ReactionResponse {
  likeCount: number;
  starCount: number;
}

async function postReaction(
  eventId: string,
  kind: Kind,
  op: "add" | "remove",
): Promise<ReactionResponse> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/reactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ kind, op }),
  });
  if (!res.ok) {
    throw new Error(`reaction failed: ${res.status}`);
  }
  return (await res.json()) as ReactionResponse;
}

export function ReactionButtons({
  eventId,
  initialLikeCount,
  initialStarCount,
  initialLiked,
  initialStarred,
}: ReactionButtonsProps) {
  const [state, setState] = useState<State>({
    likeCount: initialLikeCount,
    starCount: initialStarCount,
    liked: initialLiked,
    starred: initialStarred,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const m = messages.card;

  const toggle = useCallback(
    (kind: Kind) => {
      // Snapshot the pre-toggle state so we can roll back on failure.
      const prev = state;
      const isOn = kind === "like" ? prev.liked : prev.starred;
      const op = isOn ? "remove" : "add";
      const delta = isOn ? -1 : 1;

      // Optimistic update.
      setState({
        likeCount: kind === "like" ? Math.max(0, prev.likeCount + delta) : prev.likeCount,
        starCount: kind === "star" ? Math.max(0, prev.starCount + delta) : prev.starCount,
        liked: kind === "like" ? !prev.liked : prev.liked,
        starred: kind === "star" ? !prev.starred : prev.starred,
      });
      setError(null);

      startTransition(() => {
        postReaction(eventId, kind, op)
          .then((result) => {
            // Reconcile counts with server truth; keep our local toggle.
            setState((cur) => ({
              ...cur,
              likeCount: result.likeCount,
              starCount: result.starCount,
            }));
          })
          .catch(() => {
            // Roll back the optimistic toggle + count.
            setState(prev);
            setError(m.reactionError);
          });
      });
    },
    [eventId, m.reactionError, state],
  );

  return (
    <div className="reactions" aria-live="polite">
      <button
        type="button"
        className={`reaction ${state.liked ? "on" : ""}`}
        aria-pressed={state.liked}
        aria-label={state.liked ? m.liked : m.like}
        disabled={isPending}
        onClick={() => toggle("like")}
      >
        <span aria-hidden="true">{state.liked ? "♥" : "♡"}</span>
        <span className="count">{state.likeCount}</span>
      </button>
      <button
        type="button"
        className={`reaction ${state.starred ? "on" : ""}`}
        aria-pressed={state.starred}
        aria-label={state.starred ? m.starred : m.star}
        disabled={isPending}
        onClick={() => toggle("star")}
      >
        <span aria-hidden="true">{state.starred ? "★" : "☆"}</span>
        <span className="count">{state.starCount}</span>
      </button>
      {error && <output className="reaction-error">{error}</output>}
    </div>
  );
}
