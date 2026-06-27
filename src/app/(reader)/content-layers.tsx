// Detail reading layers: show AI 摘要 and the source body on the same page. 原文 can still
// upgrade to the extracted full article on demand, and foreign-language bodies can be
// translated by the event-scoped translation API.

"use client";

import { useState } from "react";
import { messages } from "@/i18n";
import type { RichBlock } from "@/content/rich-blocks";
import { RichContent } from "./rich-content";

type FullStatus = "idle" | "loading" | "ok" | "unavailable" | "error";
type TranslationStatus = "idle" | "loading" | "ok" | "error";

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
  const [fullStatus, setFullStatus] = useState<FullStatus>("idle");
  const [fullText, setFullText] = useState("");
  const [blocks, setBlocks] = useState<RichBlock[]>([]);
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>("idle");
  const [translatedText, setTranslatedText] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);

  const showBody = async () => {
    if (!canFetchFull || fullStatus !== "idle") return; // nothing to fetch / already fetched
    setFullStatus("loading");
    try {
      const res = await fetch(`/api/events/${eventId}/fulltext`);
      if (!res.ok) {
        setFullStatus("error");
        return;
      }
      const data = (await res.json()) as { status: string; text: string | null; blocks?: RichBlock[] };
      if (data.status === "ok" && data.text) {
        setFullText(data.text);
        setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
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

  const translateBody = async () => {
    if (translationStatus === "loading") return;
    if (translatedText) {
      setShowTranslation(true);
      return;
    }
    setTranslationStatus("loading");
    try {
      const res = await fetch(`/api/events/${eventId}/translate`, { method: "POST" });
      if (!res.ok) {
        setTranslationStatus("error");
        return;
      }
      const data = (await res.json()) as { translated_text?: string };
      if (data.translated_text) {
        setTranslatedText(data.translated_text);
        setShowTranslation(true);
        setTranslationStatus("ok");
      } else {
        setTranslationStatus("error");
      }
    } catch {
      setTranslationStatus("error");
    }
  };

  // The merged body has two layers only: AI summary, and 原文 (which prefers the full article).
  const hasBodyTab = originalText !== null || canFetchFull;
  // Prefer the complete article, but never replace a clean excerpt with a shorter extraction.
  const upgraded =
    fullStatus === "ok" && fullText.length > 0 && (originalText === null || fullText.length >= originalText.length);
  const body = upgraded ? fullText : originalText;
  // Rich rendering (tables/code/images/headings) wins when the full-article extraction produced
  // structured blocks; otherwise we fall back to the plain-text body (ingested 原文 or pre-B1.5
  // cached extractions). Only show rich blocks when we'd also be showing the upgraded full text.
  const richReady = upgraded && blocks.length > 0;
  const bodyHeading = showTranslation && translatedText ? m.translated : m.original;

  return (
    <div className="content-layers">
      <section className="content-layer-summary" aria-label={m.ai}>
        <h3 className="content-layer-heading">{m.ai}</h3>
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
      </section>

      {hasBodyTab && (
        <section className="content-layer-original" aria-label={bodyHeading}>
          <h3 className="content-layer-heading">{bodyHeading}</h3>
          <div className="content-layer-actions">
            {canFetchFull && (
              <button
                type="button"
                onClick={showBody}
                disabled={fullStatus === "loading" || fullStatus === "ok"}
                data-tooltip="拉取站内可读的完整正文"
              >
                {fullStatus === "loading" ? m.loading : m.loadOriginal}
              </button>
            )}
            <button
              type="button"
              onClick={showTranslation ? () => setShowTranslation(false) : translateBody}
              disabled={translationStatus === "loading"}
              data-tooltip="把原文翻译成中文阅读"
            >
              {showTranslation ? m.showOriginal : translationStatus === "loading" ? m.translating : translatedText ? m.showTranslation : m.translate}
            </button>
          </div>
          {showTranslation && translatedText ? (
            <div className="original-text-body">{translatedText}</div>
          ) : richReady ? (
            // Full article extracted into structured blocks: tables, code, images, headings.
            <RichContent blocks={blocks} />
          ) : body !== null ? (
            // We have text (ingested 原文, silently upgraded to the full article when available).
            // Full-text fetch failing is a no-op: just keep showing 原文, never blank or noisy.
            <div className="original-text-body">{body}</div>
          ) : fullStatus === "loading" ? (
            <p className="content-layer-note">{m.loading}</p>
          ) : (
            <p className="content-layer-note">{m.unavailable}</p>
          )}
          {translationStatus === "error" && (
            <p className="content-layer-note">{m.translationFailed}</p>
          )}
        </section>
      )}
    </div>
  );
}
