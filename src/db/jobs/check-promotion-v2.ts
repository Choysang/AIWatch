// Promotion job — scoring-v2 (SP4). Loads candidates with their denormalized selection_score
// + confidence cap (selection_max_level), runs the v2 tournament, and persists B/A/S decisions.
// selected_level/label/promoted_at/selected_breakdown are written ONLY here. Never downgrades.
//
// Supersedes the v1 promotion job: every tier gates on selection_score, and the confidence cap
// prevents low-trust items from exceeding B. Only events that recompute-scores-v2 has scored
// (selection_score not null) participate; legacy/unclassified events are excluded until the
// content-type backfill + a v2 recompute have run.

import { eq, isNotNull, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, sources } from "@/db/schema";
import { loadOwnerAffinityProfile } from "@/db/jobs/recompute-rank-scores";
import { computeOwnerBoost } from "@/scoring/owner-affinity";
import { rankScoreConfig } from "@/scoring/rank-score";
import { scoringConfig, type ScoringConfig } from "@/scoring/config";
import { applyEditorialPreference } from "@/scoring/editorial-preferences";
import { levelRank } from "@/scoring/promotion";
import { computePromotionsV2, type PromotionCandidateV2 } from "@/scoring/promotion-v2";
import type { PromotedLevel } from "@/scoring/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromotionResult {
  candidates: number;
  applied: Record<PromotedLevel, number>;
  upgraded: number;
  demoted: number;
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
  editorialReasons?: string[];
  /** B only (promotion-v3): the APP_TZ publish day whose daily tournament was won. */
  bucketDay?: string;
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
      title: events.title,
      summary: events.summary,
      detailedSummary: events.detailedSummary,
      recommendationReason: events.recommendationReason,
      category: events.category,
      contentType: events.contentType,
      tags: events.tags,
      mainSourceId: events.mainSourceId,
      sourceType: sources.sourceType,
      publishedAt: events.publishedAt,
      createdAt: events.createdAt,
      currentLevel: events.selectedLevel,
      selectionScore: events.selectionScore,
      selectionMaxLevel: events.selectionMaxLevel,
      directPushAt: events.expertDirectPushAt,
    })
    .from(events)
    .leftJoin(sources, eq(sources.id, events.mainSourceId))
    .where(
      sql`${isNotNull(events.selectionScore)} and coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff}`,
    );

  const { profile, directVerdicts } = await loadOwnerAffinityProfile(db);
  const editorialById = new Map<string, ReturnType<typeof applyEditorialPreference>>();

  const candidates: PromotionCandidateV2[] = rows.map((r) => ({
    id: r.id,
    selectionScore: (() => {
      const ownerBoost = computeOwnerBoost(
        {
          directVerdict: directVerdicts.get(r.id) ?? null,
          sourceId: r.mainSourceId,
          category: r.category,
          contentType: r.contentType,
          tags: r.tags ?? [],
        },
        profile,
        rankScoreConfig.owner,
      ).ownerBoost;
      const editorial = applyEditorialPreference({
        selectionScore: r.selectionScore ?? 0,
        ownerBoost,
        title: r.title,
        summary: [r.summary, r.detailedSummary, r.recommendationReason].filter(Boolean).join("\n\n"),
        contentType: r.contentType,
        sourceType: r.sourceType,
      });
      editorialById.set(r.id, editorial);
      return editorial.score;
    })(),
    maxLevel: asPromotedLevel(r.selectionMaxLevel),
    publishedAt: r.publishedAt ?? r.createdAt,
    currentLevel: r.currentLevel,
    directPushAt: r.directPushAt ?? null,
  }));

  const decisions = computePromotionsV2(candidates, now, config);
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const applied: Record<PromotedLevel, number> = { B: 0, A: 0, S: 0 };
  let upgraded = 0;
  let demoted = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const editorial = editorialById.get(row.id);
      if (
        row.currentLevel !== "none" &&
        row.directPushAt == null &&
        editorial &&
        editorial.reasons.length > 0 &&
        editorial.score < p.thresholds.B
      ) {
        await tx
          .update(events)
          .set({
            selectedLevel: "none",
            selectedLabel: null,
            promotedAt: null,
            selectedBreakdown: {
              scoringConfigVersion: config.version,
              promotionConfigVersion: p.version,
              level: "none",
              selectionScore: editorial.score,
              threshold: p.thresholds.B,
              editorialReasons: editorial.reasons,
              demotedAt: now.toISOString(),
            },
            updatedAt: now,
          })
          .where(eq(events.id, row.id));
        demoted++;
      }
    }

    for (const d of decisions) {
      const row = rowById.get(d.id);
      if (!row) continue;
      if (levelRank(d.level) < levelRank(row.currentLevel)) continue; // never downgrade
      const isUpgrade = levelRank(d.level) > levelRank(row.currentLevel);
      const editorial = editorialById.get(d.id);

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
        ...(editorial?.reasons.length ? { editorialReasons: editorial.reasons } : {}),
        ...(d.bucketDay ? { bucketDay: d.bucketDay } : {}),
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

  return { candidates: rows.length, applied, upgraded, demoted };
}
