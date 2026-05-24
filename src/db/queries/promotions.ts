// Promotion read queries for the admin console: selected events with their explainable
// breakdown (why this level, which window/rank, against which threshold).

import { desc, ne } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";
import type { SelectedBreakdown } from "@/db/jobs/check-promotion";

export interface PromotedEventRow {
  id: string;
  title: string;
  selectedLevel: "B" | "A" | "S";
  selectedLabel: string | null;
  qualityScore: number | null;
  promotedAt: Date | null;
  breakdown: SelectedBreakdown | null;
}

export async function listPromotedEvents(db: DB = defaultDb): Promise<PromotedEventRow[]> {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      selectedLevel: events.selectedLevel,
      selectedLabel: events.selectedLabel,
      qualityScore: events.qualityScore,
      promotedAt: events.promotedAt,
      breakdown: events.selectedBreakdown,
    })
    .from(events)
    .where(ne(events.selectedLevel, "none"))
    .orderBy(desc(events.promotedAt));
  return rows as PromotedEventRow[];
}
