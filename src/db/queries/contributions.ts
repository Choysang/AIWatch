// Contribution read queries for the admin review console (decision 14).

import { desc } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { contributions } from "@/db/schema";
import type { ContributionKind, ContributionStatus, ContributionTarget } from "@/contributions/types";

export interface ContributionRow {
  id: string;
  kind: ContributionKind;
  targetType: ContributionTarget;
  targetId: string | null;
  proposedChange: unknown;
  reason: string | null;
  status: ContributionStatus;
  contributorUserId: string | null;
  contributorFingerprint: string | null;
  reviewNote: string | null;
  appliedTargetId: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

export async function listContributions(take = 50, db: DB = defaultDb): Promise<ContributionRow[]> {
  const capped = Math.min(Math.max(1, Math.floor(take)), 200);
  const rows = await db
    .select({
      id: contributions.id,
      kind: contributions.kind,
      targetType: contributions.targetType,
      targetId: contributions.targetId,
      proposedChange: contributions.proposedChange,
      reason: contributions.reason,
      status: contributions.status,
      contributorUserId: contributions.contributorUserId,
      contributorFingerprint: contributions.contributorFingerprint,
      reviewNote: contributions.reviewNote,
      appliedTargetId: contributions.appliedTargetId,
      createdAt: contributions.createdAt,
      reviewedAt: contributions.reviewedAt,
    })
    .from(contributions)
    .orderBy(desc(contributions.createdAt))
    .limit(capped);
  return rows as ContributionRow[];
}
