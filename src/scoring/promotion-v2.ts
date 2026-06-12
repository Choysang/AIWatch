// Deterministic B/A/S promotion tournament — scoring-v2 (SP4). Pure function -> golden tests.
//
// Replaces promotion.ts's split gate (base_score for B, promotion_score for A/S) with a single
// gate on selection_score across all tiers, plus a confidence cap:
//   - Every tier qualifies on selection_score >= threshold (nested 94 >= 86 >= 75), so a high
//     scorer that loses a scarce S/A slot cascades down to compete for the next tier.
//   - The confidence cap (maxLevel, from selection-score: confidence < 40 => "B") forbids an
//     event from winning above its cap no matter how high its selection_score — a single
//     low-trust item can't rocket to S.
//   - Expert direct-push remains a B auto-qualifier, bypassing the B score threshold.
//   - Winners only; non-winners and out-of-window events are untouched (no downgrade).
//
// promotion-v3 (owner decision 2026-06-12): B is bucketed by APP_TZ publish day. Each civil
// day holds its own tournament with slots.B slots, so a post crawled days after it was
// published still claims a 当日精选 slot on its own publish day (windowDays.B bounds how far
// back). The old rolling now-1d window made late-discovered content permanently ineligible.

import { appCalendarDate } from "@/core/time";
import { scoringConfig, type ScoringConfig } from "./config";
import { levelRank } from "./promotion";
import type { PromotedLevel, SelectedLevel } from "./types";

const TIER_ORDER: readonly PromotedLevel[] = ["S", "A", "B"];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromotionCandidateV2 {
  id: string;
  /** scoring-v2 selection_score (0-100). Gates every tier. */
  selectionScore: number;
  /** Confidence cap: highest tier this event may reach ("B" or "S"). */
  maxLevel: PromotedLevel;
  /** Candidacy window is measured against this; null = ineligible (no known time). */
  publishedAt: Date | null;
  currentLevel: SelectedLevel;
  /** Non-null = certified expert direct-push to B. Bypasses the B selection threshold. */
  directPushAt?: Date | null;
}

export interface PromotionDecisionV2 {
  id: string;
  level: PromotedLevel;
  label: string;
  selectionScore: number;
  /** The confidence cap that applied (for the explainable breakdown). */
  maxLevel: PromotedLevel;
  threshold: number;
  windowDays: number;
  rankInWindow: number;
  slotLimit: number;
  directPushed?: boolean;
  /** B only: the APP_TZ publish day ("YYYY-MM-DD") whose daily tournament this event won. */
  bucketDay?: string;
}

interface CandidateWithScore {
  source: PromotionCandidateV2;
  score: number;
  directPushed: boolean;
}

function compareCandidates(a: CandidateWithScore, b: CandidateWithScore): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.source.publishedAt?.getTime() ?? 0;
  const bt = b.source.publishedAt?.getTime() ?? 0;
  if (bt !== at) return bt - at; // more recent first
  return a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0;
}

export function computePromotionsV2(
  candidates: readonly PromotionCandidateV2[],
  now: Date = new Date(),
  config: ScoringConfig = scoringConfig,
): PromotionDecisionV2[] {
  const p = config.promotion;
  const assigned = new Set<string>();
  const decisions: PromotionDecisionV2[] = [];

  for (const level of TIER_ORDER) {
    const threshold = p.thresholds[level];
    const cutoff = now.getTime() - p.windowDays[level] * DAY_MS;

    const eligible: CandidateWithScore[] = [];
    for (const c of candidates) {
      if (assigned.has(c.id)) continue;
      if (c.publishedAt == null) continue;
      if (c.publishedAt.getTime() < cutoff) continue;
      // Confidence cap: skip tiers above the event's allowed ceiling.
      if (levelRank(level) > levelRank(c.maxLevel)) continue;

      if (level === "B") {
        const directPushed = c.directPushAt != null;
        if (!directPushed && c.selectionScore < threshold) continue;
        eligible.push({
          source: c,
          score: directPushed ? Math.max(c.selectionScore, threshold) : c.selectionScore,
          directPushed,
        });
      } else {
        if (c.selectionScore < threshold) continue;
        eligible.push({ source: c, score: c.selectionScore, directPushed: false });
      }
    }

    const slots = p.slots[level];

    if (level === "B") {
      // Per-publish-day buckets (promotion-v3): each APP_TZ civil day runs its own
      // tournament, so late-discovered posts compete only against their own day.
      const buckets = new Map<string, CandidateWithScore[]>();
      for (const e of eligible) {
        // publishedAt is non-null here (filtered above).
        const day = appCalendarDate(e.source.publishedAt as Date);
        const bucket = buckets.get(day);
        if (bucket) {
          bucket.push(e);
        } else {
          buckets.set(day, [e]);
        }
      }
      for (const [day, bucket] of buckets) {
        bucket.sort(compareCandidates);
        bucket.slice(0, slots).forEach((w, index) => {
          assigned.add(w.source.id);
          const decision: PromotionDecisionV2 = {
            id: w.source.id,
            level,
            label: p.labels[level],
            selectionScore: w.score,
            maxLevel: w.source.maxLevel,
            threshold,
            windowDays: p.windowDays[level],
            rankInWindow: index + 1,
            slotLimit: slots,
            bucketDay: day,
          };
          if (w.directPushed) decision.directPushed = true;
          decisions.push(decision);
        });
      }
      continue;
    }

    eligible.sort(compareCandidates);
    eligible.slice(0, slots).forEach((w, index) => {
      assigned.add(w.source.id);
      const decision: PromotionDecisionV2 = {
        id: w.source.id,
        level,
        label: p.labels[level],
        selectionScore: w.score,
        maxLevel: w.source.maxLevel,
        threshold,
        windowDays: p.windowDays[level],
        rankInWindow: index + 1,
        slotLimit: slots,
      };
      if (w.directPushed) decision.directPushed = true;
      decisions.push(decision);
    });
  }

  return decisions;
}
