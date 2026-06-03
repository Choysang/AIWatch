// Comment composer (Slice 10). Client island under the comments section.
// Submits to POST /api/events/[id]/comments, then triggers a router.refresh() so the
// SSR feed re-renders with the new row. If the classifier flags the body as low-value,
// the server still returns 200 but with classification metadata absent from the public
// payload — we infer the flag from a router.refresh() that doesn't surface a new comment
// (cheap UX hint without leaking the classifier's verdict). On hard failure, surface a
// generic error to keep the rule list opaque.

"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { messages } from "@/i18n";

interface CommentComposerProps {
  eventId: string;
  /** SP3.1: when set, submissions are replies to this top-level comment. */
  parentId?: string;
  /** SP3.1: reply boxes use a compact layout + reply-specific placeholder. */
  variant?: "comment" | "reply";
  /** SP3.1: called after a successful submit (e.g. to collapse a reply box). */
  onSubmitted?: () => void;
  /**
   * SP3 point C: detail-page composers refresh the SSR shell to surface the new row;
   * inline (feed) composers re-fetch their own client list instead, so they pass false
   * and reload via onSubmitted. Defaults to the detail-page behaviour.
   */
  refreshOnSubmit?: boolean;
}

interface ComposerState {
  body: string;
  error: string | null;
}

export function CommentComposer({
  eventId,
  parentId,
  variant = "comment",
  onSubmitted,
  refreshOnSubmit = true,
}: CommentComposerProps) {
  const m = messages.comments;
  const router = useRouter();
  const [state, setState] = useState<ComposerState>({ body: "", error: null });
  const [isPending, startTransition] = useTransition();
  const isReply = variant === "reply";
  const placeholder = isReply ? m.replyPlaceholder : m.composerPlaceholder;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = state.body.trim();
    if (trimmed.length === 0) {
      setState((s) => ({ ...s, error: m.bodyEmpty }));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(parentId ? { body: trimmed, parentId } : { body: trimmed }),
        });
        if (!res.ok) {
          setState((s) => ({ ...s, error: m.submitError }));
          return;
        }
        setState({ body: "", error: null });
        onSubmitted?.();
        // Re-fetch the SSR shell so newly-public comments appear. Low-value rows
        // won't surface — the absence of a new row in the refreshed page is the
        // UX signal that the comment was classifier-filtered. Inline (feed) composers
        // skip this and reload their own client list via onSubmitted instead.
        if (refreshOnSubmit) router.refresh();
      } catch {
        setState((s) => ({ ...s, error: m.submitError }));
      }
    });
  };

  const fieldId = parentId ? `comment-body-${parentId}` : "comment-body";

  return (
    <form className={`comment-composer${isReply ? " reply" : ""}`} onSubmit={handleSubmit}>
      <label htmlFor={fieldId} className="visually-hidden">
        {placeholder}
      </label>
      <textarea
        id={fieldId}
        placeholder={placeholder}
        value={state.body}
        onChange={(e) => setState({ body: e.target.value, error: null })}
        rows={isReply ? 2 : 3}
        maxLength={4000}
        disabled={isPending}
      />
      <div className="composer-actions">
        {state.error && <output className="composer-error">{state.error}</output>}
        <button type="submit" disabled={isPending || state.body.trim().length === 0}>
          {isPending ? m.submitting : isReply ? m.replySubmit : m.submit}
        </button>
      </div>
    </form>
  );
}
