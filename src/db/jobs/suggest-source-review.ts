// Source pause-suggestion job (decision 9 / source strategy). Computes each active source's
// contribution metrics in one grouped query, runs the deterministic policy
// (sources/review.ts), and writes the suggestion flag. It never pauses or disables a source —
// human confirmation is required (spec) — and it clears the flag when a source recovers.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events, sources } from "@/db/schema";
import { decideSourceReview, sourceReviewConfig, type SourceReviewConfig } from "@/sources/review";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SourceReviewResult {
  scanned: number;
  flagged: number; // suggestions newly set this run
  cleared: number; // suggestions removed this run (source recovered)
}

export async function suggestSourceReviews(
  now: Date = new Date(),
  db: DB = defaultDb,
  config: SourceReviewConfig = sourceReviewConfig,
): Promise<SourceReviewResult> {
  const cutoff60 = new Date(now.getTime() - config.noContributionDays * DAY_MS);
  const cutoff30 = new Date(now.getTime() - config.lowRateDays * DAY_MS);

  // One grouped pass: per active source, count selected contribution (60d) and recent
  // events / selected events (30d). count(events.id) ignores the null-padded LEFT JOIN row
  // so sources with no events score 0 rather than 1.
  const rows = await db
    .select({
      id: sources.id,
      createdAt: sources.createdAt,
      lastFetchAt: sources.lastFetchAt,
      reviewReason: sources.reviewReason,
      selectedContribution60d: sql<number>`count(${events.id}) filter (
        where ${events.selectedLevel} <> 'none' and ${events.promotedAt} >= ${cutoff60}
      )`,
      events30d: sql<number>`count(${events.id}) filter (
        where coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff30}
      )`,
      selectedCount30d: sql<number>`count(${events.id}) filter (
        where ${events.selectedLevel} <> 'none'
          and coalesce(${events.publishedAt}, ${events.createdAt}) >= ${cutoff30}
      )`,
    })
    .from(sources)
    .leftJoin(events, eq(events.mainSourceId, sources.id))
    .where(and(eq(sources.enabled, true), isNull(sources.archivedAt)))
    .groupBy(sources.id, sources.createdAt, sources.lastFetchAt, sources.reviewReason);

  let flagged = 0;
  let cleared = 0;

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const reason = decideSourceReview(
        {
          createdAt: r.createdAt,
          lastFetchAt: r.lastFetchAt,
          selectedContribution60d: Number(r.selectedContribution60d),
          events30d: Number(r.events30d),
          selectedCount30d: Number(r.selectedCount30d),
        },
        now,
        config,
      );

      const prev = r.reviewReason;
      if (reason === prev) continue; // no change (covers null === null)

      if (reason === null) {
        await tx
          .update(sources)
          .set({ reviewSuggestedAt: null, reviewReason: null, updatedAt: now })
          .where(eq(sources.id, r.id));
        cleared++;
      } else {
        await tx
          .update(sources)
          .set({
            reviewReason: reason,
            // Stamp the suggestion time only on first flag; keep it when the reason escalates.
            ...(prev === null ? { reviewSuggestedAt: now } : {}),
            updatedAt: now,
          })
          .where(eq(sources.id, r.id));
        flagged++;
      }
    }
  });

  return { scanned: rows.length, flagged, cleared };
}
