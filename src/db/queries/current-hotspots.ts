import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { eventPosts, events, posts, sources } from "@/db/schema";

export interface HotspotSource {
  name: string;
  type: string | null;
}

export interface HotspotCandidate {
  id: string;
  title: string;
  sourceCount: number;
  officialSourceCount: number;
  qualityScore: number | null;
  selectedLevel: "none" | "B" | "A" | "S";
  publishedAt: Date | null;
  createdAt: Date;
  sources: HotspotSource[];
}

export interface CurrentHotspot {
  id: string;
  title: string;
  sourceCount: number;
  sourceNames: string[];
  score: number;
  lastSeenAt: Date;
}

const HOTSPOT_WINDOW_HOURS = 72;
const MIN_HOTSPOT_SCORE = 1;
const MAX_HOTSPOTS = 5;

const LEVEL_WEIGHT: Record<HotspotCandidate["selectedLevel"], number> = {
  none: 0,
  B: 0.18,
  A: 0.32,
  S: 0.46,
};

function effectiveTime(candidate: Pick<HotspotCandidate, "publishedAt" | "createdAt">): Date {
  return candidate.publishedAt ?? candidate.createdAt;
}

function hoursSince(value: Date, now: Date): number {
  return Math.max(0, (now.getTime() - value.getTime()) / (60 * 60 * 1000));
}

function uniqueSources(sourcesList: HotspotSource[]): HotspotSource[] {
  const seen = new Set<string>();
  const out: HotspotSource[] = [];
  for (const source of sourcesList) {
    const name = source.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, type: source.type });
  }
  return out;
}

function computeHotspotScore(candidate: HotspotCandidate, now: Date): number {
  const publishedAt = effectiveTime(candidate);
  const ageHours = hoursSince(publishedAt, now);
  if (ageHours > HOTSPOT_WINDOW_HOURS) return 0;

  const sourceHeat = Math.log2(Math.max(1, candidate.sourceCount)) * 1.9;
  const multiSourceBoost = candidate.sourceCount >= 3 ? 1 : candidate.sourceCount >= 2 ? 0.5 : 0;
  const officialBoost = Math.min(candidate.officialSourceCount, 3) * 0.38;
  const qualityBoost = Math.max(0, (candidate.qualityScore ?? 60) - 60) / 100;
  const levelBoost = LEVEL_WEIGHT[candidate.selectedLevel];
  const timeDecay = Math.exp(-ageHours / 42);

  return (sourceHeat + multiSourceBoost + officialBoost + qualityBoost + levelBoost) * timeDecay;
}

export function rankCurrentHotspots(
  candidates: HotspotCandidate[],
  now: Date = new Date(),
  limit = MAX_HOTSPOTS,
): CurrentHotspot[] {
  return candidates
    .map((candidate) => {
      const dedupedSources = uniqueSources(candidate.sources);
      const sourceCount = dedupedSources.length || candidate.sourceCount;
      const officialSourceCount =
        dedupedSources.length > 0
          ? dedupedSources.filter((source) => source.type === "official").length
          : candidate.officialSourceCount;
      const normalized = { ...candidate, sourceCount, officialSourceCount, sources: dedupedSources };
      return {
        id: normalized.id,
        title: normalized.title,
        sourceCount,
        sourceNames: dedupedSources.map((source) => source.name),
        score: computeHotspotScore(normalized, now),
        lastSeenAt: effectiveTime(normalized),
      };
    })
    .filter((item) => item.sourceCount >= 2 && item.score >= MIN_HOTSPOT_SCORE)
    .sort((a, b) => b.score - a.score || b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .slice(0, limit);
}

export async function listCurrentHotspots(
  eventIds: string[],
  now: Date = new Date(),
  db: DB = defaultDb,
): Promise<CurrentHotspot[]> {
  if (eventIds.length === 0) return [];

  const cutoff = new Date(now.getTime() - HOTSPOT_WINDOW_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      sourceCount: events.sourceCount,
      qualityScore: events.qualityScore,
      selectedLevel: events.selectedLevel,
      publishedAt: events.publishedAt,
      createdAt: events.createdAt,
      sourceName: sources.name,
      sourceType: sources.sourceType,
    })
    .from(events)
    .innerJoin(eventPosts, eq(eventPosts.eventId, events.id))
    .innerJoin(posts, eq(posts.id, eventPosts.postId))
    .innerJoin(sources, eq(sources.id, posts.sourceId))
    .where(
      and(
        inArray(events.id, eventIds),
        eq(eventPosts.relation, "same_event"),
        gte(sql`coalesce(${events.publishedAt}, ${events.createdAt})`, cutoff),
      ),
    )
    .orderBy(desc(events.sourceCount), desc(events.publishedAt), desc(events.createdAt));

  const byEvent = new Map<string, HotspotCandidate>();
  for (const row of rows) {
    const candidate = byEvent.get(row.id) ?? {
      id: row.id,
      title: row.title,
      sourceCount: row.sourceCount,
      officialSourceCount: 0,
      qualityScore: row.qualityScore,
      selectedLevel: row.selectedLevel,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      sources: [],
    };
    if (row.sourceName) {
      candidate.sources.push({ name: row.sourceName, type: row.sourceType });
      if (row.sourceType === "official") candidate.officialSourceCount += 1;
    }
    byEvent.set(row.id, candidate);
  }

  return rankCurrentHotspots([...byEvent.values()], now);
}
