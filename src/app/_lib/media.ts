// Defensive extraction of a primary image URL from an event's `media` jsonb.
// The shape is connector-dependent and untyped (`unknown`); today most sources store
// null. We probe the common shapes and bail to null on anything unexpected, so a card
// never renders a broken or non-image src. Strictly best-effort and side-effect free.

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function urlFromObject(obj: Record<string, unknown>): string | null {
  for (const key of ["url", "src", "href", "image", "thumbnail", "thumb"]) {
    const candidate = obj[key];
    if (isHttpUrl(candidate)) return candidate;
  }
  return null;
}

/** Best-effort primary image URL from untyped media; null when absent or unrecognized. */
export function extractImageUrl(media: unknown): string | null {
  if (isHttpUrl(media)) return media;
  if (Array.isArray(media)) {
    for (const item of media) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (media && typeof media === "object") {
    const obj = media as Record<string, unknown>;
    const direct = urlFromObject(obj);
    if (direct) return direct;
    // Nested collections: { images: [...] } / { media: [...] } / { items: [...] }.
    for (const key of ["images", "media", "items"]) {
      if (key in obj) {
        const url = extractImageUrl(obj[key]);
        if (url) return url;
      }
    }
  }
  return null;
}
