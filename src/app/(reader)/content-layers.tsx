// Content-layer switcher (v0.5 B1): readers toggle an event's body between AI 摘要 / 原文 /
// 全文. Default = AI (the page's prior behavior). 原文 is the ingested post text (already
// converted to plain text server-side). 全文 is fetched on demand from /api/events/[id]/fulltext
// (readability extraction, cached) and rendered as plain text; failures fall back to a hint to
// read 原文 / open the source. Only the layers that have content render a tab.

"use client";

import { useState } from "react";
import { messages } from "@/i18n";

type Layer = "ai" | "original" | "fulltext";
type FullStatus = "idle" | "loading" | "ok" | "unavailable" | "error";

export function ContentLayers({
  eventId,
  summary,
  recommendationReason,
  originalText,
}: {
  eventId: string;
  summary: string | null;
  recommendationReason: string | null;
  originalText: string | null;
}) {
  const m = messages.detail.layer;
  const [layer, setLayer] = useState<Layer>("ai");
  const [fullStatus, setFullStatus] = useState<FullStatus>("idle");
  const [fullText, setFullText] = useState("");

  const showFulltext = async () => {
    setLayer("fulltext");
    if (fullStatus !== "idle") return; // already fetched / fetching
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

  const tabs: { key: Layer; label: string; onClick: () => void }[] = [
    { key: "ai", label: m.ai, onClick: () => setLayer("ai") },
    ...(originalText ? [{ key: "original" as Layer, label: m.original, onClick: () => setLayer("original") }] : []),
    { key: "fulltext", label: m.fulltext, onClick: showFulltext },
  ];

  return (
    <div className="content-layers">
      <div className="content-layer-tabs" role="tablist" aria-label={m.label}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={layer === tab.key}
            className={`content-layer-tab ${layer === tab.key ? "is-active" : ""}`}
            onClick={tab.onClick}
          >
            {tab.label}
          </button>
        ))}
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

        {layer === "original" && originalText && (
          <div className="original-text-body">{originalText}</div>
        )}

        {layer === "fulltext" && (
          <div className="fulltext-body">
            {fullStatus === "loading" && <p className="content-layer-note">{m.loading}</p>}
            {fullStatus === "ok" && <div className="original-text-body">{fullText}</div>}
            {fullStatus === "unavailable" && <p className="content-layer-note">{m.unavailable}</p>}
            {fullStatus === "error" && <p className="content-layer-note">{m.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
