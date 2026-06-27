// Defensive extraction of primary card media from an event's `media` jsonb.
// The shape is connector-dependent and untyped (`unknown`); today most sources store
// null. We probe the common shapes and bail to null on anything unexpected, so a card
// never renders a broken media URL. Strictly best-effort and side-effect free.

export type CardMedia =
  | { type: "image"; url: string }
  | { type: "video"; url: string; poster?: string };

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function urlFromObject(obj: Record<string, unknown>): string | null {
  for (const key of ["url", "src", "href", "video", "videoUrl", "mp4", "source", "image", "thumbnail", "thumb"]) {
    const candidate = obj[key];
    if (isHttpUrl(candidate)) return candidate;
  }
  return null;
}

function textFromObject(obj: Record<string, unknown>, keys: string[]): string {
  return keys
    .map((key) => obj[key])
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function looksLikeVideo(obj: Record<string, unknown>, url: string): boolean {
  const hint = textFromObject(obj, ["type", "kind", "medium", "mime", "contentType", "@_type", "@_medium"]);
  return /\bvideo\b|\.mp4(?:\?|$)|\.webm(?:\?|$)|\.mov(?:\?|$)|\.m3u8(?:\?|$)/i.test(`${hint} ${url}`);
}

function posterFromObject(obj: Record<string, unknown>): string | undefined {
  for (const key of ["poster", "thumbnail", "thumb", "image"]) {
    const candidate = obj[key];
    if (isHttpUrl(candidate)) return candidate;
  }
  return undefined;
}

/** Best-effort card media from untyped media; null when absent or unrecognized. */
export function extractCardMedia(media: unknown): CardMedia | null {
  if (isHttpUrl(media)) return { type: "image", url: media };
  if (Array.isArray(media)) {
    const found = media
      .map(extractCardMedia)
      .filter((item): item is CardMedia => Boolean(item));
    return found.find((item) => item.type === "video") ?? found[0] ?? null;
  }
  if (media && typeof media === "object") {
    const obj = media as Record<string, unknown>;
    const direct = urlFromObject(obj);
    if (direct) {
      if (looksLikeVideo(obj, direct)) {
        const poster = posterFromObject(obj);
        return poster ? { type: "video", url: direct, poster } : { type: "video", url: direct };
      }
      return { type: "image", url: direct };
    }
    // Nested collections: { images: [...] } / { videos: [...] } / { media: [...] } / { items: [...] }.
    for (const key of ["videos", "images", "media", "items"]) {
      if (key in obj) {
        const nested = extractCardMedia(obj[key]);
        if (nested) return nested;
      }
    }
  }
  return null;
}

/** Best-effort primary image URL from untyped media; null when absent or unrecognized. */
export function extractImageUrl(media: unknown): string | null {
  const cardMedia = extractCardMedia(media);
  if (!cardMedia) return null;
  return cardMedia.type === "video" ? cardMedia.poster ?? null : cardMedia.url;
}

/** Same-origin proxy URL for external images. */
export function proxiedImageUrl(url: string): string {
  return `/api/img?u=${encodeURIComponent(url)}`;
}
