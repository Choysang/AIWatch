// Manual X-post entry (Task 3): an operator pastes a real tweet's URL + content and the
// curated provenance, and we run it through the SAME event-formation pipeline the worker
// uses (gate -> normalize -> judge -> score -> event). This module is the pure boundary:
// validate untrusted form input and shape it into a connector `RawPost`. No DB, no network
// -> unit-testable. The orchestration (load source + processSource) lives in manual-ingest.ts.

import { z } from "zod";
import type { RawPost } from "@/connectors/types";

/** Treat blank/whitespace-only optional fields as "absent" so empty form inputs don't
 *  become empty strings in the DB. Required fields validate `min(1)` after trim instead. */
const blankToUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const MAX_CONTENT = 8000;

/** http(s) URL only — mirrors the reader's defensive isHttpUrl so a stored image src is
 *  always renderable in an <img> (rejects data:/javascript: and other URL-valid schemes). */
const httpUrl = (message: string) =>
  z
    .string()
    .trim()
    .url(message)
    .refine((u) => /^https?:\/\//i.test(u), message);

// Form-encoded admin input. Strings only (it comes from a <form>); coercion to Date happens
// in toRawPost so the schema stays representation-agnostic and easy to test.
export const manualPostInputSchema = z.object({
  url: httpUrl("无效的帖子链接"),
  content: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1, "内容不能为空").max(MAX_CONTENT, `内容过长（最多 ${MAX_CONTENT} 字）`),
  ),
  title: z.preprocess(blankToUndefined, z.string().trim().max(300).optional()),
  authorName: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  authorHandle: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  imageUrl: z.preprocess(blankToUndefined, httpUrl("无效的图片链接").optional()),
  // datetime-local ("2026-05-31T14:30") or ISO; parsed + validated for realness in toRawPost.
  publishedAt: z.preprocess(blankToUndefined, z.string().optional()),
});

export type ManualPostInput = z.infer<typeof manualPostInputSchema>;

/** Parse a date-ish string to a real Date, or null when absent/unparseable. */
export function parsePublishedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shape validated manual input into the connector `RawPost` the pipeline consumes.
 *  media is stored as `{ url }` so the reader's defensive extractImageUrl picks it up. */
export function toRawPost(input: ManualPostInput): RawPost {
  return {
    url: input.url,
    rawTitle: input.title ?? null,
    rawContent: input.content,
    authorName: input.authorName ?? null,
    authorHandle: input.authorHandle ?? null,
    media: input.imageUrl ? { url: input.imageUrl } : null,
    publicMetrics: null,
    publishedAt: parsePublishedAt(input.publishedAt),
  };
}
