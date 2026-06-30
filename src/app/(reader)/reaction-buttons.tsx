// Reaction buttons (Slice 8): public reader feedback lives in the bottom card row.
// "无用" visibly collapses feed cards while still keeping the undo affordance available.
// Optimistic updates with rollback on failure. Calls POST /api/events/[id]/reactions.
// Identity comes from the request cookie/session — this component just sends ops.

"use client";

import { useCallback, useState } from "react";
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
  const [isSaving, setIsSaving] = useState(false);
  const m = messages.card;

  const toggle = useCallback(
    (kind: Kind) => {
      if (isSaving) return;
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
      setIsSaving(true);

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
        })
        .finally(() => setIsSaving(false));
    },
    [eventId, isSaving, m.reactionError, state],
  );

  return (
    <div className="reactions" aria-live="polite">
      {state.downed && (
        <div className="downed-banner">
          <span>{m.downedNotice}</span>
          <button type="button" disabled={isSaving} onClick={() => toggle("down")}>
            {m.undo}
          </button>
        </div>
      )}
      <button
        type="button"
        className={`reaction reaction-like ${state.liked ? "on" : ""}`}
        aria-pressed={state.liked}
        aria-label={state.liked ? m.liked : m.like}
        title={state.liked ? "取消有用反馈" : "标记有用，帮助提高类似内容权重"}
        data-tooltip={state.liked ? "取消有用反馈" : "标记有用，帮助提高类似内容权重"}
        disabled={isSaving}
        onClick={() => toggle("like")}
      >
        <span aria-hidden="true">{state.liked ? "♥" : "♡"}</span>
        <span>{m.like}</span>
        <span className="count">{state.likeCount}</span>
      </button>
      <button
        type="button"
        className={`reaction reaction-star ${state.starred ? "on" : ""}`}
        aria-pressed={state.starred}
        aria-label={state.starred ? m.starred : m.star}
        title={state.starred ? "取消收藏" : "收藏到深读列表"}
        data-tooltip={state.starred ? "取消收藏" : "收藏到深读列表"}
        disabled={isSaving}
        onClick={() => toggle("star")}
      >
        <span aria-hidden="true">{state.starred ? "★" : "☆"}</span>
        <span>{m.star}</span>
        <span className="count">{state.starCount}</span>
      </button>
      <button
        type="button"
        className={`reaction reaction-down ${state.downed ? "on" : ""}`}
        aria-pressed={state.downed}
        aria-label={state.downed ? m.downed : m.down}
        title={state.downed ? "取消无用反馈" : "标记无用，折叠并减少类似内容"}
        data-tooltip={state.downed ? "取消无用反馈" : "标记无用，折叠并减少类似内容"}
        disabled={isSaving}
        onClick={() => toggle("down")}
      >
        <span aria-hidden="true">−</span>
        <span>{m.down}</span>
        <span className="count">{state.downCount}</span>
      </button>
      {error && <output className="reaction-error">{error}</output>}
    </div>
  );
}
