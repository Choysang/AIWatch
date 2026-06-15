// Content-layer switcher (v0.5 B1, merged): readers toggle an event's body between AI 摘要 and
// 原文. Default = AI (the page's prior behavior). 原文 shows the ingested post text immediately,
// and — when the event has a source link — auto-fetches the complete article via readability
// (/api/events/[id]/fulltext) and upgrades in place, but only when the extracted full text is at
// least as long as the ingested excerpt (so a poor extraction never downgrades a clean original).
// Everything renders as plain text (XSS-inert by construction), no sanitizer needed.

"use client";

import { useState } from "react";
import { messages } from "@/i18n";

type Layer = "ai" | "body";
type FullStatus = "idle" | "loading" | "ok" | "unavailable" | "error";

export function ContentLayers({
  eventId,
  summary,
  recommendationReason,
  originalText,
  canFetchFull,
}: {
  eventId: string;
  summary: string | null;
  recommendationReason: string | null;
  originalText: string | null;
  /** The event has a source URL to try readability on (so 原文 can upgrade to the full article). */
  canFetchFull: boolean;
}) {
  const m = messages.detail.layer;
  const [layer, setLayer] = useState<Layer>("ai");
  const [fullStatus, setFullStatus] = useState<FullStatus>("idle");
  const [fullText, setFullText] = useState("");

  const showBody = async () => {
    setLayer("body");
    if (!canFetchFull || fullStatus !== "idle") return; // nothing to fetch / already fetched
    setFullStatus("loading");
    try {
      const res = await fetch(`/api/events/${eventId}/fulltext`);
      if (!res.ok) {
        setFullStatus("error");
        return;
      }
      const data = (await res.json()) as { status: string; text: string | null };
      if (data.status === "ok" && data.text) {
        setFullText(data.text);
        setFullStatus("ok");
      } else if (data.status === "empty" || data.status === "unavailable") {
        setFullStatus("unavailable");
      } else {
        setFullStatus("error");
      }
    } catch {
      setFullStatus("error");
    }
  };

  // The merged body has two layers only: AI summary, and 原文 (which prefers the full article).
  const hasBodyTab = originalText !== null || canFetchFull;
  // Prefer the complete article, but never replace a clean excerpt with a shorter extraction.
  const upgraded =
    fullStatus === "ok" && fullText.length > 0 && (originalText === null || fullText.length >= originalText.length);
  const body = upgraded ? fullText : originalText;

  return (
    <div className="content-layers">
      <div className="content-layer-tabs" role="tablist" aria-label={m.label}>
        <button
          type="button"
          role="tab"
          aria-selected={layer === "ai"}
          className={`content-layer-tab ${layer === "ai" ? "is-active" : ""}`}
          onClick={() => setLayer("ai")}
        >
          {m.ai}
        </button>
        {hasBodyTab && (
          <button
            type="button"
            role="tab"
            aria-selected={layer === "body"}
            className={`content-layer-tab ${layer === "body" ? "is-active" : ""}`}
            onClick={showBody}
          >
            {m.original}
          </button>
        )}
      </div>

      <div className="content-layer-body">
        {layer === "ai" && (
          <>
            {summary ? (
              <p className="summary">{summary}</p>
            ) : (
              <p className="content-layer-note">{m.aiEmpty}</p>
            )}
            {recommendationReason && (
              <p className="reason">
                <span className="label">{messages.card.recommendationReason}</span>
                {recommendationReason}
              </p>
            )}
          </>
        )}

        {layer === "body" && (
          <div className="original-text-body-wrap">
            {body !== null && <div className="original-text-body">{body}</div>}
            {upgraded && <p className="content-layer-note content-layer-ok">{m.fullLoaded}</p>}
            {body !== null && fullStatus === "loading" && (
              <p className="content-layer-note">{m.loading}</p>
            )}
            {body !== null && (fullStatus === "unavailable" || fullStatus === "error") && (
              <p className="content-layer-note">{m.fullFallback}</p>
            )}
            {body === null && fullStatus === "loading" && (
              <p className="content-layer-note">{m.loading}</p>
            )}
            {body === null && fullStatus === "unavailable" && (
              <p className="content-layer-note">{m.unavailable}</p>
            )}
            {body === null && fullStatus === "error" && (
              <p className="content-layer-note">{m.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
