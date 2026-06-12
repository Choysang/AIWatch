// Reaction buttons (Slice 8, reworked 方案B): positive feedback lives ONLY in the bottom
// ♥ like / ★ star row; the hover-revealed top-right corner keeps a single 👎 "不感兴趣"
// that visibly collapses the card (see .card:has(.quick-feedback-button.is-negative.on)
// in globals.css) and offers an undo banner. Down still feeds the rank-v4 penalty.
// Optimistic updates with rollback on failure. Calls POST /api/events/[id]/reactions.
// Identity comes from the request cookie/session — this component just sends ops.

"use client";

import { useCallback, useState, useTransition } from "react";
import { messages } from "@/i18n";

interface ReactionButtonsProps {
  eventId: string;
  initialLikeCount: number;
  initialStarCount: number;
  initialDownCount: number;
  initialLiked: boolean;
  initialStarred: boolean;
  initialDowned: boolean;
}

type Kind = "like" | "star" | "down";

interface State {
  likeCount: number;
  starCount: number;
  downCount: number;
  liked: boolean;
  starred: boolean;
  downed: boolean;
}

interface ReactionResponse {
  likeCount: number;
  starCount: number;
  downCount: number;
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
  initialDownCount,
  initialLiked,
  initialStarred,
  initialDowned,
}: ReactionButtonsProps) {
  const [state, setState] = useState<State>({
    likeCount: initialLikeCount,
    starCount: initialStarCount,
    downCount: initialDownCount,
    liked: initialLiked,
    starred: initialStarred,
    downed: initialDowned,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const m = messages.card;

  const toggle = useCallback(
    (kind: Kind) => {
      // Snapshot the pre-toggle state so we can roll back on failure.
      const prev = state;
      const isOn = kind === "like" ? prev.liked : kind === "star" ? prev.starred : prev.downed;
      const op = isOn ? "remove" : "add";
      const delta = isOn ? -1 : 1;
      const nextLiked = kind === "like" ? !prev.liked : kind === "down" && op === "add" ? false : prev.liked;
      const nextDowned = kind === "down" ? !prev.downed : kind === "like" && op === "add" ? false : prev.downed;

      // Optimistic update.
      setState({
        likeCount:
          kind === "like"
            ? Math.max(0, prev.likeCount + delta)
            : kind === "down" && op === "add" && prev.liked
              ? Math.max(0, prev.likeCount - 1)
              : prev.likeCount,
        starCount: kind === "star" ? Math.max(0, prev.starCount + delta) : prev.starCount,
        downCount:
          kind === "down"
            ? Math.max(0, prev.downCount + delta)
            : kind === "like" && op === "add" && prev.downed
              ? Math.max(0, prev.downCount - 1)
              : prev.downCount,
        liked: nextLiked,
        starred: kind === "star" ? !prev.starred : prev.starred,
        downed: nextDowned,
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
              downCount: result.downCount,
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
      <div className="quick-feedback" aria-label={m.quickFeedback}>
        <button
          type="button"
          className={`quick-feedback-button is-negative ${state.downed ? "on" : ""}`}
          aria-pressed={state.downed}
          aria-label={state.downed ? m.downed : m.down}
          title={state.downed ? m.downed : m.down}
          disabled={isPending}
          onClick={() => toggle("down")}
        >
          <span aria-hidden="true">👎</span>
        </button>
      </div>
      {state.downed && (
        <div className="downed-banner">
          <span>{m.downedNotice}</span>
          <button type="button" disabled={isPending} onClick={() => toggle("down")}>
            {m.undo}
          </button>
        </div>
      )}
      <button
        type="button"
        className={`reaction reaction-like ${state.liked ? "on" : ""}`}
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
        className={`reaction reaction-star ${state.starred ? "on" : ""}`}
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
