// Promotion job (decision 7/D: bulk recompute + tournament live in db/jobs). Loads
// candidate events with their current base_score AND promotion_score, runs the
// deterministic tournament (scoring/promotion), and persists B/A/S decisions.
// selected_level/label/promoted_at/selected_breakdown are written ONLY here. Never
// downgrades an already-selected event.
//
// Scoring Integrity slice: B-tier still gates on base_score (entry tier — reader/expert
// signal hasn't accumulated yet). A and S gate on promotion_score, which mixes expert
// value + comment quality + citation quality into base. expert_direct_push bypasses B's
// score threshold per spec (the lever that lets curators rescue under-scored items).

import { eq, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, eventScores } from "@/db/schema";
import { scoringConfig, type ScoringConfig } from "@/scoring/config";
import { computePromotions, levelRank, type PromotionCandidate } from "@/scoring/promotion";
import type { PromotedLevel } from "@/scoring/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromotionResult {
  candidates: number;
  applied: Record<PromotedLevel, number>;
  upgraded: number; // events whose level strictly increased this run
}

export interface SelectedBreakdown {
  promotionConfigVersion: string;
  level: PromotedLevel;
  baseScore: number;
  promotionScore: number;
  threshold: number;
  windowDays: number;
  rankInWindow: number;
  slotLimit: number;
  directPushed: boolean;
  computedAt: string;
}

export async function checkPromotion(
  now: Date = new Date(),
  db: DB = defaultDb,
  config: ScoringConfig = scoringConfig,
): Promise<PromotionResult> {
  const p = config.promotion;
  const maxWindowDays = Math.max(p.windowDays.B, p.windowDays.A, p.windowDays.S);
  const cutoff = new Date(now.getTime() - maxWindowDays * DAY_MS);

  // Candidate set: events with a current score whose effective time is within the widest
  // window. The pure tournament re-filters per tier, so this is just a bound on rows read.
  // promotion_score may be null for events that predate the recompute job — fall back to
  // base_score so they can still B-qualify (and never A/S since promotion_score is null,
  // not equal to base, when missing).
  const rows = await db
    .select({
      id: events.id,
      publishedAt: events.publishedAt,
      createdAt: events.createdAt,
      currentLevel: events.selectedLevel,
      baseScore: eventScores.baseScore,
      promotionScore: eventScores.promotionScore,
      directPushAt: events.expertDirectPushAt,
    })
    .from(events)
    .innerJoin(eventScores, eq(eventScores.id, events.currentScoreId))
    .where(sql`coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff}`);

  const candidates: PromotionCandidate[] = rows.map((r) => ({
    id: r.id,
    baseScore: r.baseScore,
    promotionScore: r.promotionScore ?? r.baseScore,
    publishedAt: r.publishedAt ?? r.createdAt,
    currentLevel: r.currentLevel,
    directPushAt: r.directPushAt ?? null,
  }));

  const decisions = computePromotions(candidates, now, config);
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const applied: Record<PromotedLevel, number> = { B: 0, A: 0, S: 0 };
  let upgraded = 0;

  await db.transaction(async (tx) => {
    for (const d of decisions) {
      const row = rowById.get(d.id);
      if (!row) continue;
      const current = row.currentLevel;
      if (levelRank(d.level) < levelRank(current)) continue; // never downgrade
      const isUpgrade = levelRank(d.level) > levelRank(current);

      const breakdown: SelectedBreakdown = {
        promotionConfigVersion: p.version,
        level: d.level,
        baseScore: row.baseScore,
        promotionScore: row.promotionScore ?? row.baseScore,
        threshold: d.threshold,
        windowDays: d.windowDays,
        rankInWindow: d.rankInWindow,
        slotLimit: d.slotLimit,
        directPushed: d.directPushed === true,
        computedAt: now.toISOString(),
      };

      await tx
        .update(events)
        .set({
          selectedLevel: d.level,
          selectedLabel: d.label,
          selectedBreakdown: breakdown,
          // First promotion to this-or-higher level stamps promoted_at; re-runs keep it.
          ...(isUpgrade ? { promotedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(events.id, d.id));

      applied[d.level]++;
      if (isUpgrade) upgraded++;
    }
  });

  return { candidates: rows.length, applied, upgraded };
}
