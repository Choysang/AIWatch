// Promotion job (decision 7/D: bulk recompute + tournament live in db/jobs). Loads
// candidate events with their current base_score, runs the deterministic tournament
// (scoring/promotion), and persists B/A/S decisions. selected_level/label/promoted_at/
// selected_breakdown are written ONLY here. Never downgrades an already-selected event.

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
  promotionScore: number;
  threshold: number;
  windowDays: number;
  rankInWindow: number;
  slotLimit: number;
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
  const rows = await db
    .select({
      id: events.id,
      publishedAt: events.publishedAt,
      createdAt: events.createdAt,
      currentLevel: events.selectedLevel,
      baseScore: eventScores.baseScore,
    })
    .from(events)
    .innerJoin(eventScores, eq(eventScores.id, events.currentScoreId))
    .where(sql`coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff}`);

  const candidates: PromotionCandidate[] = rows.map((r) => ({
    id: r.id,
    promotionScore: r.baseScore,
    publishedAt: r.publishedAt ?? r.createdAt,
    currentLevel: r.currentLevel,
  }));

  const decisions = computePromotions(candidates, now, config);
  const currentById = new Map(rows.map((r) => [r.id, r.currentLevel]));

  const applied: Record<PromotedLevel, number> = { B: 0, A: 0, S: 0 };
  let upgraded = 0;

  await db.transaction(async (tx) => {
    for (const d of decisions) {
      const current = currentById.get(d.id) ?? "none";
      if (levelRank(d.level) < levelRank(current)) continue; // never downgrade
      const isUpgrade = levelRank(d.level) > levelRank(current);

      const breakdown: SelectedBreakdown = {
        promotionConfigVersion: p.version,
        level: d.level,
        promotionScore: d.promotionScore,
        threshold: d.threshold,
        windowDays: d.windowDays,
        rankInWindow: d.rankInWindow,
        slotLimit: d.slotLimit,
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
