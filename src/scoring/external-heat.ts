// Deterministic external-heat normalization: per-platform log saturation.
// Raw metrics are platform-relative and unbounded, so we saturate each platform
// independently and clamp to 0-100. Reproducible, history-free, cold-start safe.

import { scoringConfig, type ScoringConfig } from "./config";
import type { Platform, PublicMetrics } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function externalHeatScore(
  metrics: PublicMetrics | null | undefined,
  platform: Platform,
  config: ScoringConfig = scoringConfig,
): number {
  if (!metrics) return 0; // missing metrics -> heat_raw = 0
  const w = config.externalHeat.metricWeights;
  const heatRaw =
    (metrics.likes ?? 0) * w.like +
    (metrics.reposts ?? 0) * w.repost +
    (metrics.replies ?? 0) * w.reply +
    (metrics.stars ?? 0) * w.star +
    (metrics.comments ?? 0) * w.comment;
  if (heatRaw <= 0) return 0;
  const sat = config.externalHeat.platformSaturation[platform] ?? config.externalHeat.defaultSaturation;
  return clamp((100 * Math.log1p(heatRaw)) / Math.log1p(sat), 0, 100);
}
