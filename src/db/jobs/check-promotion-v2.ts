// Promotion job — scoring-v2 (SP4). Loads candidates with their denormalized selection_score
// + confidence cap (selection_max_level), runs the v2 tournament, and persists B/A/S decisions.
// selected_level/label/promoted_at/selected_breakdown are written ONLY here. Never downgrades.
//
// Supersedes check-promotion.ts: every tier gates on selection_score, and the confidence cap
// prevents low-trust items from exceeding B. Only events that recompute-scores-v2 has scored
// (selection_score not null) participate; legacy/unclassified events are excluded until the
// content-type backfill + a v2 recompute have run.

import { eq, isNotNull, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";
import { scoringConfig, type ScoringConfig } from "@/scoring/config";
import { levelRank } from "@/scoring/promotion";
import { computePromotionsV2, type PromotionCandidateV2 } from "@/scoring/promotion-v2";
import type { PromotedLevel } from "@/scoring/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromotionResult {
  candidates: number;
  applied: Record<PromotedLevel, number>;
  upgraded: number;
}

export interface SelectedBreakdownV2 {
  scoringConfigVersion: string;
  promotionConfigVersion: string;
  level: PromotedLevel;
  selectionScore: number;
  /** Confidence cap that applied to this event. */
  maxLevel: PromotedLevel;
  threshold: number;
  windowDays: number;
  rankInWindow: number;
  slotLimit: number;
  directPushed: boolean;
  computedAt: string;
}

function asPromotedLevel(raw: string | null): PromotedLevel {
  return raw === "B" || raw === "A" || raw === "S" ? raw : "S";
}

export async function checkPromotionV2(
  now: Date = new Date(),
  db: DB = defaultDb,
  config: ScoringConfig = scoringConfig,
): Promise<PromotionResult> {
  const p = config.promotion;
  const maxWindowDays = Math.max(p.windowDays.B, p.windowDays.A, p.windowDays.S);
  const cutoff = new Date(now.getTime() - maxWindowDays * DAY_MS);

  const rows = await db
    .select({
      id: events.id,
      publishedAt: events.publishedAt,
      createdAt: events.createdAt,
      currentLevel: events.selectedLevel,
      selectionScore: events.selectionScore,
      selectionMaxLevel: events.selectionMaxLevel,
      directPushAt: events.expertDirectPushAt,
    })
    .from(events)
    .where(
      sql`${isNotNull(events.selectionScore)} and coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff}`,
    );

  const candidates: PromotionCandidateV2[] = rows.map((r) => ({
    id: r.id,
    selectionScore: r.selectionScore ?? 0,
    maxLevel: asPromotedLevel(r.selectionMaxLevel),
    publishedAt: r.publishedAt ?? r.createdAt,
    currentLevel: r.currentLevel,
    directPushAt: r.directPushAt ?? null,
  }));

  const decisions = computePromotionsV2(candidates, now, config);
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const applied: Record<PromotedLevel, number> = { B: 0, A: 0, S: 0 };
  let upgraded = 0;

  await db.transaction(async (tx) => {
    for (const d of decisions) {
      const row = rowById.get(d.id);
      if (!row) continue;
      if (levelRank(d.level) < levelRank(row.currentLevel)) continue; // never downgrade
      const isUpgrade = levelRank(d.level) > levelRank(row.currentLevel);

      const breakdown: SelectedBreakdownV2 = {
        scoringConfigVersion: config.version,
        promotionConfigVersion: p.version,
        level: d.level,
        selectionScore: d.selectionScore,
        maxLevel: d.maxLevel,
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
