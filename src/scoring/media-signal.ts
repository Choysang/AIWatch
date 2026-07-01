function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function hasMediaUrl(value: unknown): boolean {
  if (isHttpUrl(value)) return true;
  if (Array.isArray(value)) return value.some(hasMediaUrl);
  if (!value || typeof value !== "object") return false;

  const obj = value as Record<string, unknown>;
  for (const key of [
    "url",
    "src",
    "href",
    "video",
    "videoUrl",
    "mp4",
    "source",
    "image",
    "thumbnail",
    "thumb",
    "poster",
  ]) {
    if (isHttpUrl(obj[key])) return true;
  }
  for (const key of ["images", "videos", "media", "items"]) {
    if (hasMediaUrl(obj[key])) return true;
  }
  return false;
}

export function hasTextAndMedia(input: {
  title?: string | null;
  content?: string | null;
  media?: unknown;
}): boolean {
  if (!hasMediaUrl(input.media)) return false;
  const text = `${input.title ?? ""} ${input.content ?? ""}`.replace(/\s+/g, " ").trim();
  return text.length >= 12;
}
