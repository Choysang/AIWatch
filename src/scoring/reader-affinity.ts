// Reader personalization affinity (v0.5 A3). Pure + deterministic: aggregate a reader's
// like / star / down / view signals into per-dimension affinity ∈ [-1, +1], then derive a
// query-time readerBoost. Mirrors the owner-affinity dimensions/clamp idea ([[owner-affinity.ts]])
// but signals are weighted scores (star > like > view; down strongly negative), and the boost
// includes the tag dimension (the core of a reader's interests — topic boards are tag-based).
// The profile is computed per request and never persisted (P2): there are millions of rid
// identities; only the owner profile is precomputed into events.rank_score.

export type ReaderSignalKind = "star" | "like" | "view" | "down";

export interface ReaderSignal {
  signal: ReaderSignalKind;
  tags: readonly string[];
  sourceId: string | null;
  category: string | null;
  contentType: string | null;
}

export interface ReaderEventDims {
  tags: readonly string[];
  sourceId?: string | null;
  category: string | null;
  contentType: string | null;
}

export interface ReaderAffinityEntry {
  /** Weighted signal sum for this key. */
  score: number;
  /** Number of signals touching this key. */
  n: number;
  /** clamp(score / saturation, -1, +1); 0 when n < minSamples. */
  affinity: number;
}

export type ReaderAffinityTable = ReadonlyMap<string, ReaderAffinityEntry>;

export interface ReaderAffinityProfile {
  tag: ReaderAffinityTable;
  source: ReaderAffinityTable;
  category: ReaderAffinityTable;
  contentType: ReaderAffinityTable;
  /** True when the reader has no signals at all (cold start -> ranking falls back). */
  isEmpty: boolean;
}

export interface ReaderAffinityConfig {
  weights: Record<ReaderSignalKind, number>;
  /** Score magnitude that maps to full ±1 affinity. */
  saturation: number;
  /** Max |points| readerBoost can add to an event's base score. */
  affinityBoostMax: number;
  /** Min signals on a (dim,key) before its affinity counts (1 = always). */
  minSamples: number;
  version: string;
}

export const readerAffinityConfig: ReaderAffinityConfig = {
  // view is plentiful and weak; star/like are intentional; down is an explicit "not interested".
  weights: { star: 3, like: 2, view: 0.5, down: -4 },
  saturation: 6,
  // ~25 vs a 0–100 qualityScore base: strong personal match re-ranks meaningfully without
  // overpowering quality.
  affinityBoostMax: 25,
  minSamples: 1,
  version: "reader-affinity-v1",
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function tally(table: Map<string, { score: number; n: number }>, key: string | null | undefined, weight: number): void {
  if (!key) return;
  const entry = table.get(key) ?? { score: 0, n: 0 };
  table.set(key, { score: entry.score + weight, n: entry.n + 1 });
}

function finalize(
  table: Map<string, { score: number; n: number }>,
  saturation: number,
  minSamples: number,
): ReaderAffinityTable {
  const out = new Map<string, ReaderAffinityEntry>();
  for (const [key, { score, n }] of table) {
    const affinity = n >= minSamples ? clamp(score / saturation, -1, 1) : 0;
    out.set(key, { score, n, affinity });
  }
  return out;
}

/** Aggregate weighted reader signals into per-dimension affinity tables (deterministic). */
export function buildReaderAffinityProfile(
  signals: readonly ReaderSignal[],
  config: ReaderAffinityConfig = readerAffinityConfig,
): ReaderAffinityProfile {
  const tag = new Map<string, { score: number; n: number }>();
  const source = new Map<string, { score: number; n: number }>();
  const category = new Map<string, { score: number; n: number }>();
  const contentType = new Map<string, { score: number; n: number }>();

  for (const s of signals) {
    const weight = config.weights[s.signal];
    for (const t of s.tags) tally(tag, t, weight);
    tally(source, s.sourceId, weight);
    tally(category, s.category, weight);
    tally(contentType, s.contentType, weight);
  }

  return {
    tag: finalize(tag, config.saturation, config.minSamples),
    source: finalize(source, config.saturation, config.minSamples),
    category: finalize(category, config.saturation, config.minSamples),
    contentType: finalize(contentType, config.saturation, config.minSamples),
    isEmpty: signals.length === 0,
  };
}

/** Affinity for a key, or null when the reader has no signal on it (excluded from the mean). */
function affinityOf(table: ReaderAffinityTable, key: string | null | undefined): number | null {
  if (!key) return null;
  return table.get(key)?.affinity ?? null;
}

/**
 * Query-time personalization boost for one event. Averages affinity only over the dimensions
 * the reader actually has signal on (a single strongly-liked tag yields a strong boost rather
 * than being diluted by neutral source/category). Returns 0 when nothing matches.
 */
export function computeReaderBoost(
  dims: ReaderEventDims,
  profile: ReaderAffinityProfile,
  config: ReaderAffinityConfig = readerAffinityConfig,
): number {
  const parts: number[] = [];

  const tagAffinities = dims.tags
    .map((t) => affinityOf(profile.tag, t))
    .filter((a): a is number => a !== null);
  if (tagAffinities.length > 0) {
    parts.push(tagAffinities.reduce((sum, a) => sum + a, 0) / tagAffinities.length);
  }

  const source = affinityOf(profile.source, dims.sourceId ?? null);
  if (source !== null) parts.push(source);
  const category = affinityOf(profile.category, dims.category);
  if (category !== null) parts.push(category);
  const contentType = affinityOf(profile.contentType, dims.contentType);
  if (contentType !== null) parts.push(contentType);

  if (parts.length === 0) return 0;
  const mean = parts.reduce((sum, a) => sum + a, 0) / parts.length;
  return clamp(config.affinityBoostMax * mean, -config.affinityBoostMax, config.affinityBoostMax);
}
