// Pure normalization of a RawPost into the derived fields a Post row needs:
// canonical URL, content hash, and a display title following the spec's title rule.
// No DB, no network -> unit-testable.

import type { RawPost } from "@/connectors/types";
import { canonicalizeUrl, contentHash } from "@/core/dedup";

export type TitleSource = "original" | "first_sentence" | "ai_generated";

export interface NormalizedPost {
  canonicalUrl: string | null;
  contentHash: string;
  displayTitle: string | null;
  titleSource: TitleSource | null;
}

const FIRST_SENTENCE = /^[\s\S]*?[。．.!！?？\n]/;

/** First sentence (or a trimmed prefix) of a title-less social post. */
function firstSentence(content: string): string {
  const match = content.match(FIRST_SENTENCE);
  const sentence = (match ? match[0] : content).trim().replace(/[。．.!！?？]+$/, "");
  return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

export function normalizePost(raw: RawPost): NormalizedPost {
  const rawTitle = raw.rawTitle?.trim() || null;
  const rawContent = raw.rawContent?.trim() || null;

  let displayTitle: string | null = null;
  let titleSource: TitleSource | null = null;
  if (rawTitle) {
    displayTitle = rawTitle;
    titleSource = "original";
  } else if (rawContent) {
    displayTitle = firstSentence(rawContent);
    titleSource = "first_sentence";
  }

  return {
    canonicalUrl: raw.url ? canonicalizeUrl(raw.url) : null,
    // Hash title+content so the same item from different URLs collides for dedup audit.
    contentHash: contentHash(`${rawTitle ?? ""}\n${rawContent ?? ""}`),
    displayTitle,
    titleSource,
  };
}
