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
  summary: string | null;
  tags: string[];
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
  mentionCount: number;
  sourceNames: string[];
  score: number;
  lastSeenAt: Date;
  keywords: string[];
}

const HOTSPOT_WINDOW_HOURS = 24;
const MIN_HOTSPOT_SCORE = 1;
const MAX_HOTSPOTS = 5;
const MIN_KEYWORD_SUPPORT = 2;

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

const HOTSPOT_KEYWORD_PREFIX_RE =
  /^(gpt|claude|sonnet|opus|haiku|gemini|veo|sora|imagen|fable|llama|mistral|qwen|deepseek|kimi|doubao|grok|midjourney|stable|flux|seedance|wan|hailuo|hunyuan|glm|ernie|gemma|perplexity|chatgpt)/i;

const HOTSPOT_TAG_STOPWORDS = new Set([
  "ai",
  "agent",
  "agents",
  "model",
  "models",
  "release",
  "product",
  "research",
  "模型",
  "产品",
  "发布",
  "更新",
  "研究",
  "论文",
  "行业",
  "讨论",
]);

function normalizeKeyword(token: string): string | null {
  const cleaned = token
    .trim()
    .replace(/^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}.+#-]+$/gu, "");
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (HOTSPOT_TAG_STOPWORDS.has(lower)) return null;
  if (/^[a-z]{1,3}$/i.test(cleaned)) return null;
  return lower.replace(/[\s_-]+/g, "").replace(/\.+/g, ".");
}

function isDistinctiveKeyword(token: string): boolean {
  return /\d/.test(token) || HOTSPOT_KEYWORD_PREFIX_RE.test(token);
}

function extractHotspotKeywords(candidate: HotspotCandidate): Array<{ key: string; label: string }> {
  const text = `${candidate.title} ${candidate.summary ?? ""}`;
  const labels = new Map<string, string>();

  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9.+#-]*\d[A-Za-z0-9.+#-]*\b/g)) {
    const label = match[0] ?? "";
    const key = normalizeKeyword(label);
    if (key && isDistinctiveKeyword(label)) labels.set(key, labels.get(key) ?? label);
  }

  for (const match of text.matchAll(/\b(?:GPT|Claude|Sonnet|Opus|Haiku|Gemini|Veo|Sora|Imagen|Fable|Llama|Mistral|Qwen|DeepSeek|Kimi|Doubao|Grok|Midjourney|Flux|Hunyuan|GLM|Ernie|Gemma|Perplexity|ChatGPT)[A-Za-z0-9.+#-]*\b/gi)) {
    const label = match[0] ?? "";
    const key = normalizeKeyword(label);
    if (key && isDistinctiveKeyword(label)) labels.set(key, labels.get(key) ?? label);
  }

  for (const tag of candidate.tags) {
    if (!isDistinctiveKeyword(tag)) continue;
    const key = normalizeKeyword(tag);
    if (key) labels.set(key, labels.get(key) ?? tag);
  }

  return [...labels.entries()].map(([key, label]) => ({ key, label }));
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
  const normalized = candidates.map((candidate) => {
    const dedupedSources = uniqueSources(candidate.sources);
    const sourceCount = dedupedSources.length || candidate.sourceCount;
    const officialSourceCount =
      dedupedSources.length > 0
        ? dedupedSources.filter((source) => source.type === "official").length
        : candidate.officialSourceCount;
    return { ...candidate, sourceCount, officialSourceCount, sources: dedupedSources };
  });

  const byId = new Map<string, CurrentHotspot>();
  for (const candidate of normalized) {
    const score = computeHotspotScore(candidate, now);
    if (candidate.sourceCount < 2 || score < MIN_HOTSPOT_SCORE) continue;
    byId.set(candidate.id, {
      id: candidate.id,
      title: candidate.title,
      sourceCount: candidate.sourceCount,
      mentionCount: candidate.sourceCount,
      sourceNames: candidate.sources.map((source) => source.name),
      score,
      lastSeenAt: effectiveTime(candidate),
      keywords: [],
    });
  }

  const keywordGroups = new Map<
    string,
    {
      label: string;
      sourceNames: Map<string, HotspotSource>;
      eventIds: Set<string>;
      candidates: HotspotCandidate[];
      lastSeenAt: Date;
    }
  >();

  for (const candidate of normalized) {
    const ageHours = hoursSince(effectiveTime(candidate), now);
    if (ageHours > HOTSPOT_WINDOW_HOURS) continue;
    for (const keyword of extractHotspotKeywords(candidate)) {
      const group =
        keywordGroups.get(keyword.key) ??
        {
          label: keyword.label,
          sourceNames: new Map<string, HotspotSource>(),
          eventIds: new Set<string>(),
          candidates: [],
          lastSeenAt: effectiveTime(candidate),
        };
      group.eventIds.add(candidate.id);
      group.candidates.push(candidate);
      for (const source of candidate.sources) group.sourceNames.set(source.name, source);
      if (effectiveTime(candidate).getTime() > group.lastSeenAt.getTime()) {
        group.lastSeenAt = effectiveTime(candidate);
      }
      keywordGroups.set(keyword.key, group);
    }
  }

  for (const group of keywordGroups.values()) {
    const support = Math.max(group.sourceNames.size, group.eventIds.size);
    if (support < MIN_KEYWORD_SUPPORT) continue;
    const target = group.candidates
      .slice()
      .sort(
        (a, b) =>
          b.officialSourceCount - a.officialSourceCount ||
          b.sourceCount - a.sourceCount ||
          (b.qualityScore ?? 0) - (a.qualityScore ?? 0) ||
          effectiveTime(b).getTime() - effectiveTime(a).getTime(),
      )[0];
    if (!target) continue;
    const sourceNames = [...group.sourceNames.values()].map((source) => source.name);
    const officialBoost = target.officialSourceCount > 0 ? 0.9 : 0;
    const mentionHeat =
      Math.log2(1 + group.sourceNames.size + Math.max(0, group.eventIds.size - 1)) * 1.55 +
      officialBoost;
    const score = computeHotspotScore(target, now) + mentionHeat;
    if (score < MIN_HOTSPOT_SCORE) continue;

    const existing = byId.get(target.id);
    if (existing) {
      existing.score += mentionHeat;
      existing.sourceCount = Math.max(existing.sourceCount, sourceNames.length);
      existing.mentionCount = Math.max(existing.mentionCount, support);
      existing.sourceNames = [...new Set([...existing.sourceNames, ...sourceNames])];
      existing.lastSeenAt =
        group.lastSeenAt.getTime() > existing.lastSeenAt.getTime()
          ? group.lastSeenAt
          : existing.lastSeenAt;
      existing.keywords = [...new Set([...existing.keywords, group.label])];
    } else {
      byId.set(target.id, {
        id: target.id,
        title: target.title,
        sourceCount: Math.max(target.sourceCount, sourceNames.length),
        mentionCount: support,
        sourceNames,
        score,
        lastSeenAt: group.lastSeenAt,
        keywords: [group.label],
      });
    }
  }

  return [...byId.values()]
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
      summary: events.summary,
      tags: events.tags,
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
      summary: row.summary,
      tags: row.tags ?? [],
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
