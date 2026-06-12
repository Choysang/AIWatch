// Post persistence. Posts are unique per (source_id, canonical_url); global dedup
// happens via event resolution, not by rejecting inserts (decision: posts schema).

import { and, eq } from "drizzle-orm";
import type { RawPost } from "@/connectors/types";
import { db as defaultDb, type DB } from "@/db/client";
import { newId } from "@/core/ids";
import type { NormalizedPost } from "@/pipeline/normalize";
import { posts } from "@/db/schema";
import type { Platform } from "@/scoring/types";

export interface InsertPostResult {
  id: string;
  inserted: boolean;
}

/**
 * Insert a post unless one with the same (source_id, canonical_url) already exists.
 * Returns the existing id with inserted=false on a hit, so the caller can skip
 * re-judging an already-seen item.
 */
export async function insertPostIfNew(
  sourceId: string,
  platform: Platform,
  raw: RawPost,
  norm: NormalizedPost,
  db: DB = defaultDb,
): Promise<InsertPostResult> {
  if (norm.canonicalUrl) {
    const existing = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.sourceId, sourceId), eq(posts.canonicalUrl, norm.canonicalUrl)))
      .limit(1);
    if (existing[0]) return { id: existing[0].id, inserted: false };
  }

  const id = newId("post");
  await db.insert(posts).values({
    id,
    sourceId,
    platform,
    authorName: raw.authorName ?? null,
    authorHandle: raw.authorHandle ?? null,
    url: raw.url ?? null,
    canonicalUrl: norm.canonicalUrl,
    contentHash: norm.contentHash,
    rawTitle: raw.rawTitle ?? null,
    displayTitle: norm.displayTitle,
    titleSource: norm.titleSource,
    rawContent: raw.rawContent ?? null,
    media: raw.media ?? null,
    publicMetrics: raw.publicMetrics ?? null,
    publishedAt: raw.publishedAt ?? null,
    initialRelevanceStatus: "relevant",
  });
  return { id, inserted: true };
}
