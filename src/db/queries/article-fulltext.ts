// Full-text get-or-extract (v0.5 B1). Returns the event's main-post full text, extracting
// + caching on first request. Cache policy: 'ok'/'empty' are cached indefinitely (an
// article's body doesn't change); 'error' is retried after a cooldown so a transient
// failure doesn't block 全文 forever. Identity-agnostic (the article is the same for everyone).

import { eq } from "drizzle-orm";
import { extractArticleRich } from "@/content/extract";
import type { RichBlock } from "@/content/rich-blocks";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts } from "@/db/schema";

export type FullTextResult =
  | { status: "ok"; text: string; blocks: RichBlock[] }
  | { status: "empty" | "error" | "unavailable"; text: null; blocks: null };

const ERROR_RETRY_MS = 60 * 60 * 1000; // re-attempt a failed extraction after 1h

export async function getOrExtractFulltext(
  eventId: string,
  db: DB = defaultDb,
  now: Date = new Date(),
): Promise<FullTextResult> {
  const rows = await db
    .select({
      postId: posts.id,
      url: posts.url,
      canonicalUrl: posts.canonicalUrl,
      fullText: posts.fullText,
      fullBlocks: posts.fullBlocks,
      status: posts.fullTextStatus,
      fetchedAt: posts.fullTextFetchedAt,
    })
    .from(events)
    .innerJoin(posts, eq(posts.id, events.mainPostId))
    .where(eq(events.id, eventId))
    .limit(1);
  const row = rows[0];
  if (!row) return { status: "unavailable", text: null, blocks: null };

  // Cache hits. (Rows cached before B1.5 have no blocks — return [] so the client falls back to
  // plain-text rendering; a forced re-extract isn't worth invalidating those rows.)
  if (row.status === "ok" && row.fullText) {
    return { status: "ok", text: row.fullText, blocks: row.fullBlocks ?? [] };
  }
  if (row.status === "empty") return { status: "empty", text: null, blocks: null };
  if (
    row.status === "error" &&
    row.fetchedAt &&
    now.getTime() - row.fetchedAt.getTime() < ERROR_RETRY_MS
  ) {
    return { status: "error", text: null, blocks: null };
  }

  const url = row.canonicalUrl ?? row.url;
  if (!url) {
    // No article to fetch — record 'empty' so we don't probe again.
    await db
      .update(posts)
      .set({ fullTextStatus: "empty", fullTextFetchedAt: now })
      .where(eq(posts.id, row.postId));
    return { status: "empty", text: null, blocks: null };
  }

  const result = await extractArticleRich(url);
  await db
    .update(posts)
    .set({
      fullText: result.status === "ok" ? result.text : null,
      fullBlocks: result.status === "ok" ? result.blocks : null,
      fullTextStatus: result.status,
      fullTextFetchedAt: now,
    })
    .where(eq(posts.id, row.postId));

  if (result.status === "ok") return { status: "ok", text: result.text, blocks: result.blocks };
  return { status: result.status, text: null, blocks: null };
}
