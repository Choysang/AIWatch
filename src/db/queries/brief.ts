import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, posts, sources } from "@/db/schema";
import type { RichBlock } from "@/content/rich-blocks";
import type { EventCategory } from "@/public/query";
import type { EventTier } from "@/pipeline/judge-schema";

export interface BriefQuery {
  category?: EventCategory;
  tier?: EventTier;
  since?: Date | null;
  sort?: "default" | "time";
  take?: number;
}

export interface BriefItem {
  id: string;
  title: string;
  category: string | null;
  tier: string | null;
  score: number | null;
  one_line_summary: string | null;
  detailed_summary: string | null;
  core_viewpoints: unknown;
  tools: unknown;
  people: unknown;
  tags: string[];
  source_count: number;
  published_at: string | null;
  updated_at: string;
  url: string | null;
  permalink?: string;
  body: string | null;
  full_text: string | null;
  full_blocks: RichBlock[];
  media: unknown;
  source: {
    name: string | null;
    handle: string | null;
    platform: string | null;
  };
}

export async function listBriefItems(
  query: BriefQuery,
  db: DB = defaultDb,
): Promise<BriefItem[]> {
  const conds: SQL[] = [];
  if (query.category) conds.push(eq(events.category, query.category));
  if (query.tier) conds.push(eq(events.pipelineTier, query.tier));
  if (query.since) {
    conds.push(gte(sql`coalesce(${events.publishedAt}, ${events.createdAt})`, query.since));
  }

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      category: events.category,
      tier: events.pipelineTier,
      score: events.pipelineScore,
      oneLineSummary: events.oneLineSummary,
      detailedSummary: events.detailedSummary,
      coreViewpoints: events.coreViewpoints,
      tools: events.tools,
      people: events.people,
      tags: events.tags,
      sourceCount: events.sourceCount,
      publishedAt: events.publishedAt,
      updatedAt: events.updatedAt,
      media: events.media,
      url: posts.url,
      fullText: posts.fullText,
      fullBlocks: posts.fullBlocks,
      sourceName: sources.name,
      sourceHandle: sources.handle,
      sourcePlatform: sources.platform,
    })
    .from(events)
    .leftJoin(posts, eq(posts.id, events.mainPostId))
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      ...(query.sort === "time"
        ? [sql`coalesce(${events.publishedAt}, ${events.createdAt}) desc nulls last`, desc(events.id)]
        : [
            sql`case ${events.pipelineTier} when 'T2' then 2 when 'T1' then 1 else 0 end desc`,
            desc(events.sourceCount),
            sql`coalesce(${events.publishedAt}, ${events.createdAt}) desc nulls last`,
            desc(events.id),
          ]),
    )
    .limit(Math.min(Math.max(query.take ?? 50, 1), 100));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    tier: row.tier,
    score: row.score,
    one_line_summary: row.oneLineSummary,
    detailed_summary: row.detailedSummary,
    core_viewpoints: row.coreViewpoints,
    tools: row.tools,
    people: row.people,
    tags: row.tags,
    source_count: row.sourceCount,
    published_at: row.publishedAt?.toISOString() ?? null,
    updated_at: row.updatedAt.toISOString(),
    url: row.url,
    permalink: `/events/${row.id}`,
    body: row.fullText ?? row.detailedSummary ?? row.oneLineSummary,
    full_text: row.fullText,
    full_blocks: row.fullBlocks ?? [],
    media: row.media,
    source: {
      name: row.sourceName,
      handle: row.sourceHandle,
      platform: row.sourcePlatform,
    },
  }));
}
