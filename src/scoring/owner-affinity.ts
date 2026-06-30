// 点6 切片C：主理人偏好画像（确定性聚合）+ ownerBoost 纯函数。
//
// 标注是不可变输入（owner_annotations 行）；本模块把事件标注按维度聚合成亲和度
// affinity ∈ [-1, +1]，并推导 rank-v5 的 ownerBoost：
//   affinity(dim, key) = (useful - not_useful) / (useful + not_useful)，n < minSamples 记 0
//   directBoost   = +usefulBoost（事件被标 useful）/ -notUsefulPenalty（被标 not_useful）
//   affinityBoost = clamp(
//     ±affinityBoostMax,
//     affinityBoostMax × mean(source, source_content_type, category, content_type, best_tag),
//   )
// 设计文档：docs/annotation-preference-design.md。SQL 批量任务（recompute-rank-scores）
// 以结构等价的 SQL 复刻 directBoost/affinityBoost，由 reactions 集成测试保证 parity。

import type { AnnotationVerdict } from "@/db/queries/owner-annotations";

export type AffinityDimension = "source" | "sourceContentType" | "category" | "contentType" | "tag";

export interface AnnotatedEventDims {
  verdict: AnnotationVerdict;
  sourceId: string | null;
  category: string | null;
  contentType: string | null;
  tags?: readonly string[];
}

export interface AffinityEntry {
  useful: number;
  notUseful: number;
  /** Total samples (useful + notUseful). */
  n: number;
  /** (useful - notUseful) / n; 0 when n < minSamples. */
  affinity: number;
}

export type AffinityTable = ReadonlyMap<string, AffinityEntry>;

export interface AffinityProfile {
  source: AffinityTable;
  sourceContentType: AffinityTable;
  category: AffinityTable;
  contentType: AffinityTable;
  tag: AffinityTable;
}

export interface OwnerBoostConfig {
  /** rank-v5: points added when the event itself is annotated useful. */
  usefulBoost: number;
  /** rank-v5: points subtracted when the event itself is annotated not_useful. */
  notUsefulPenalty: number;
  /** Max |points| the dimension-affinity mean can contribute. */
  affinityBoostMax: number;
  /** Minimum samples per (dim, key) before its affinity counts (below -> 0). */
  minSamples: number;
}

export interface OwnerBoostResult {
  ownerBoost: number;
  directBoost: number;
  affinityBoost: number;
}

function tally(
  table: Map<string, { useful: number; notUseful: number }>,
  key: string | null | undefined,
  verdict: AnnotationVerdict,
): void {
  if (!key) return;
  const entry = table.get(key) ?? { useful: 0, notUseful: 0 };
  const next =
    verdict === "useful"
      ? { useful: entry.useful + 1, notUseful: entry.notUseful }
      : { useful: entry.useful, notUseful: entry.notUseful + 1 };
  table.set(key, next);
}

export function sourceContentTypeKey(sourceId: string | null | undefined, contentType: string | null | undefined): string | null {
  if (!sourceId || !contentType) return null;
  return `${sourceId}::${contentType}`;
}

function finalize(
  table: Map<string, { useful: number; notUseful: number }>,
  minSamples: number,
): AffinityTable {
  const out = new Map<string, AffinityEntry>();
  for (const [key, { useful, notUseful }] of table) {
    const n = useful + notUseful;
    const affinity = n >= minSamples ? (useful - notUseful) / n : 0;
    out.set(key, { useful, notUseful, n, affinity });
  }
  return out;
}

/** Aggregates event annotations into per-dimension affinity tables (deterministic). */
export function buildAffinityProfile(
  rows: readonly AnnotatedEventDims[],
  minSamples: number,
): AffinityProfile {
  const source = new Map<string, { useful: number; notUseful: number }>();
  const sourceContentType = new Map<string, { useful: number; notUseful: number }>();
  const category = new Map<string, { useful: number; notUseful: number }>();
  const contentType = new Map<string, { useful: number; notUseful: number }>();
  const tag = new Map<string, { useful: number; notUseful: number }>();

  for (const row of rows) {
    tally(source, row.sourceId, row.verdict);
    tally(sourceContentType, sourceContentTypeKey(row.sourceId, row.contentType), row.verdict);
    tally(category, row.category, row.verdict);
    tally(contentType, row.contentType, row.verdict);
    for (const t of row.tags ?? []) tally(tag, t, row.verdict);
  }

  return {
    source: finalize(source, minSamples),
    sourceContentType: finalize(sourceContentType, minSamples),
    category: finalize(category, minSamples),
    contentType: finalize(contentType, minSamples),
    tag: finalize(tag, minSamples),
  };
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function affinityFor(table: AffinityTable, key: string | null | undefined): number {
  if (!key) return 0;
  return table.get(key)?.affinity ?? 0;
}

function strongestTagAffinity(table: AffinityTable, tags: readonly string[] | null | undefined): number {
  if (!tags?.length) return 0;
  let strongest = 0;
  for (const tag of tags) {
    const affinity = table.get(tag)?.affinity ?? 0;
    if (Math.abs(affinity) > Math.abs(strongest)) strongest = affinity;
  }
  return strongest;
}

/**
 * rank-v5 ownerBoost for one event. Missing/unknown dimension keys contribute a neutral 0
 * to the mean. The source×content_type dimension handles "this source is useful, but this
 * specific kind of item from it is repeatedly not useful". Tag affinity uses the strongest
 * matching tag so repeated owner labels can raise or suppress similar content, not only
 * whole sources/categories.
 */
export function computeOwnerBoost(
  input: {
    directVerdict: AnnotationVerdict | null;
    sourceId: string | null;
    category: string | null;
    contentType: string | null;
    tags?: readonly string[];
  },
  profile: AffinityProfile,
  config: OwnerBoostConfig,
): OwnerBoostResult {
  const directBoost =
    input.directVerdict === "useful"
      ? config.usefulBoost
      : input.directVerdict === "not_useful"
        ? -config.notUsefulPenalty
        : 0;

  const tagAffinity = strongestTagAffinity(profile.tag, input.tags);
  const sourceContentTypeAffinity = affinityFor(
    profile.sourceContentType,
    sourceContentTypeKey(input.sourceId, input.contentType),
  );
  const mean =
    (affinityFor(profile.source, input.sourceId) +
      sourceContentTypeAffinity +
      affinityFor(profile.category, input.category) +
      affinityFor(profile.contentType, input.contentType) +
      tagAffinity) /
    (tagAffinity === 0 ? 4 : 5);
  const affinityBoost = clamp(
    config.affinityBoostMax * mean,
    -config.affinityBoostMax,
    config.affinityBoostMax,
  );

  return { ownerBoost: directBoost + affinityBoost, directBoost, affinityBoost };
}

/** 点6 切片E：信源晋降级建议（设计文档阈值：|affinity| ≥ 0.5 且 n ≥ 5）。 */
export type SourceSuggestion = "promote" | "demote" | null;

export function sourceAffinitySuggestion(entry: AffinityEntry | undefined): SourceSuggestion {
  if (!entry || entry.n < 5) return null;
  if (entry.affinity <= -0.5) return "demote";
  if (entry.affinity >= 0.5) return "promote";
  return null;
}
