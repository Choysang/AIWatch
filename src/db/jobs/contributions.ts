// Contribution lifecycle jobs (decision 14). Public submit -> moderator triage ->
// approve/reject -> apply. Reviews enforce the RBAC capability map and the review state
// machine, and every review/apply writes an audit row (spec). Applying a reviewed source
// recommendation creates a managed source. Only source_recommendation is auto-appliable
// in V1; other kinds are review-only.

import { eq } from "drizzle-orm";
import { newId } from "@/core/ids";
import { recordAudit } from "@/db/audit";
import { db as defaultDb, type DB } from "@/db/client";
import { contributions, sources } from "@/db/schema";
import { createNotification } from "@/db/queries/notifications";
import { messages } from "@/i18n";
import { can } from "@/auth/rbac";
import { resolveTransition, type ReviewAction } from "@/contributions/review";
import type { ParsedSubmission } from "@/contributions/schema";
import type { ContributionStatus } from "@/contributions/types";
import type { CreateSourceInput } from "@/db/queries/sources";
import { inferAiSourceCategory, normalizeAiSourceCategories } from "@/sources/ai-source-categories";

export interface Contributor {
  userId?: string | null;
  fingerprint?: string | null;
  contact?: string | null;
}

export interface Reviewer {
  id: string;
  role: string;
}

export interface SubmitResult {
  id: string;
  status: ContributionStatus;
}

/** Public submission — always lands as `submitted`; no audit (it isn't an admin action). */
export async function submitContribution(
  input: ParsedSubmission,
  contributor: Contributor,
  db: DB = defaultDb,
): Promise<SubmitResult> {
  const id = newId("con");
  await db.insert(contributions).values({
    id,
    kind: input.kind,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    proposedChange: input.proposedChange,
    reason: input.reason ?? null,
    contributorUserId: contributor.userId ?? null,
    contributorFingerprint: contributor.fingerprint ?? null,
    contributorContact: input.contact ?? contributor.contact ?? null,
    status: "submitted",
  });
  return { id, status: "submitted" };
}

class ContributionError extends Error {}
export class NotFoundError extends ContributionError {}
export class ForbiddenError extends ContributionError {}
export class ConflictError extends ContributionError {}

function requireCapabilityFor(action: ReviewAction, role: string): void {
  const cap =
    action === "triage"
      ? "contribution.triage"
      : action === "apply"
        ? "contribution.apply"
        : "contribution.approve"; // approve + reject
  if (!can(role, cap)) throw new ForbiddenError(`role ${role} lacks ${cap}`);
}

/** Triage / approve / reject. Validates capability + transition, writes an audit row.
 *
 * Validation (existence, transition legality) runs BEFORE the transaction so the
 * transaction body only ever performs writes that are expected to succeed. Throwing
 * inside `db.transaction()` triggers drizzle's rollback path, which hangs under the
 * bun + node-postgres runtime used by the worker and the integration suite; keeping the
 * fallible checks outside the transaction avoids that path entirely (and is cheaper). */
export async function reviewContribution(
  id: string,
  action: Exclude<ReviewAction, "apply">,
  reviewer: Reviewer,
  note: string | undefined,
  db: DB = defaultDb,
): Promise<{ id: string; status: ContributionStatus }> {
  requireCapabilityFor(action, reviewer.role);

  const rows = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`contribution ${id} not found`);

  const from = row.status;
  const to = resolveTransition(from, action); // throws on illegal — before the transaction

  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(contributions)
      .set({ status: to, reviewerId: reviewer.id, reviewNote: note ?? row.reviewNote, reviewedAt: now })
      .where(eq(contributions.id, id));

    await recordAudit(tx, {
      action: `contribution.${action}`,
      actorId: reviewer.id,
      targetType: "contribution",
      targetId: id,
      before: { status: from },
      after: { status: to },
      reason: note ?? null,
    });

    return { id, status: to };
  });
}

/** Apply an approved contribution to the DB target (+ audit). V1: source_recommendation. */
export async function applyContribution(
  id: string,
  reviewer: Reviewer,
  note: string | undefined,
  sourceOverrideOrDb?: CreateSourceInput | DB,
  db: DB = defaultDb,
): Promise<{ id: string; status: ContributionStatus; appliedTargetId: string | null }> {
  const sourceOverride =
    sourceOverrideOrDb && "name" in sourceOverrideOrDb ? sourceOverrideOrDb : undefined;
  const targetDb = sourceOverride ? db : (sourceOverrideOrDb as DB | undefined) ?? db;
  requireCapabilityFor("apply", reviewer.role);

  // Validate before the transaction (see reviewContribution): the rollback path on a
  // throw-inside-transaction hangs under bun + node-postgres, so all fallible checks —
  // existence, the `approved -> applied` transition, and V1 kind support — run first.
  const rows = await targetDb.select().from(contributions).where(eq(contributions.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(`contribution ${id} not found`);

  const to = resolveTransition(row.status, "apply"); // requires `approved`

  if (row.kind !== "source_recommendation") {
    throw new ConflictError(`apply not supported for kind ${row.kind} in V1`);
  }

  const change = row.proposedChange as {
    url: string;
    name?: string;
    platform?: string;
    handle?: string;
    sourceProfile?: string;
    recommendedBy?: string;
    recommendReason?: string;
    categories?: string[];
  };
  const categories = normalizeAiSourceCategories(change.categories ?? []);
  const sourceCategory =
    categories[0] ??
    inferAiSourceCategory({
      sourceProfile: change.sourceProfile,
      platform: change.platform,
      name: change.name,
      handle: change.handle,
      url: change.url,
    });
  const sourceInput: CreateSourceInput = sourceOverride ?? {
    name: change.name ?? change.url,
    platform: "rss",
    sourceType: "community",
    level: "L3",
    connectorType: "rss",
    connectorRef: change.url,
    handle: change.handle ?? null,
    url: change.url,
    categories: [sourceCategory],
    brandTag: null,
    recommendedBy: change.recommendedBy ?? null,
    recommendReason: change.recommendReason ?? row.reason ?? null,
  };

  return targetDb.transaction(async (tx) => {
    const sourceId = newId("src");
    await tx.insert(sources).values({
      id: sourceId,
      name: sourceInput.name,
      platform: sourceInput.platform,
      sourceType: sourceInput.sourceType,
      level: sourceInput.level,
      connectorType: sourceInput.connectorType,
      handle: sourceInput.handle ?? null,
      url: sourceInput.url ?? null,
      connectorRef: sourceInput.connectorRef ?? null,
      categories: sourceInput.categories ?? [],
      brandTag: sourceInput.brandTag ?? null,
      recommendedBy: sourceInput.recommendedBy ?? null,
      recommendReason: sourceInput.recommendReason ?? null,
      onboardedAt: sourceInput.onboardedAt ?? new Date(),
    });

    const now = new Date();
    await tx
      .update(contributions)
      .set({
        status: to,
        reviewerId: reviewer.id,
        reviewNote: note ?? row.reviewNote,
        appliedTargetId: sourceId,
        reviewedAt: now,
      })
      .where(eq(contributions.id, id));

    await recordAudit(tx, {
      action: "contribution.apply",
      actorId: reviewer.id,
      targetType: "source",
      targetId: sourceId,
      before: null,
      after: { sourceId, url: sourceInput.url, enabled: true, fromContribution: id },
      reason: note ?? null,
    });

    // SP3.3: notify the recommender that their source was accepted. Only when the original
    // submission carried a logged-in user id, and never self-notify (a reviewer applying
    // their own recommendation). System notification: no actor.
    if (row.contributorUserId && row.contributorUserId !== reviewer.id) {
      await createNotification(
        {
          userId: row.contributorUserId,
          kind: "source_approved",
          actorId: null,
          title: messages.notifications.title.sourceApproved,
          body: sourceInput.name,
          targetType: "source",
          targetId: sourceId,
        },
        tx,
      );
    }

    return { id, status: to, appliedTargetId: sourceId };
  });
}
