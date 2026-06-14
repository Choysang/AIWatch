// Tag vocabulary for the topic-board picker (v0.5 A1). There is no curated tag list —
// tags are emergent on events (the LLM judgment produces them; readers also filter via
// ?tags= card chips). listPopularTags surfaces the most common ones so the board create
// UI offers real vocabulary as suggested chips, alongside free-text entry.

import { sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";

export interface TagCount {
  tag: string;
  count: number;
}

/** Most-used event tags, descending by count. Empty array on an empty corpus. */
export async function listPopularTags(limit = 40, db: DB = defaultDb): Promise<TagCount[]> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), 200);
  // Implicit LATERAL unnest over events.tags; rows with an empty array contribute no tag.
  const raw = await db.execute(sql<{ tag: string; count: number }>`
    SELECT tag, count(*)::int AS count
    FROM ${events}, unnest(${events.tags}) AS tag
    WHERE length(trim(tag)) > 0
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT ${capped}
  `);
  // drizzle/node-postgres returns a QueryResult ({ rows }); some paths return the array
  // directly. Handle both (mirrors comments.ts topComment query).
  const rows = Array.isArray(raw)
    ? (raw as { tag: string; count: number }[])
    : ((raw as unknown as { rows?: { tag: string; count: number }[] }).rows ?? []);
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
