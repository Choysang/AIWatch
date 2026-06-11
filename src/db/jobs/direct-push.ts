// Expert direct-push job (Scoring Integrity slice).
//
// Spec § B / daily selected: "score >= 75, or certified expert direct-push". Stamps
// events.expert_direct_push_at + by, writes an audit row, and re-arms
// last_strong_signal_at so the display-score decay clock resets. The next promotion job
// run picks up the flag and forces the event into B regardless of base_score.
//
// Capability is enforced here (event.directPush). The API route handler also enforces
// login; the job is the single place that knows the audit shape so it stays consistent
// whether called from HTTP, a worker, or a script.

import { eq } from "drizzle-orm";
import { can } from "@/auth/rbac";
import { recordAudit } from "@/db/audit";
import { db as defaultDb, type DB } from "@/db/client";
import { events } from "@/db/schema";

export class DirectPushError extends Error {}
export class DirectPushNotFoundError extends DirectPushError {}
export class DirectPushForbiddenError extends DirectPushError {}
export class DirectPushConflictError extends DirectPushError {}

export interface DirectPushActor {
  id: string;
  role: string;
}

export interface DirectPushResult {
  eventId: string;
  alreadyPushed: boolean;
}

/** Set expert_direct_push_at on an event (B-tier bypass) + audit. Idempotent: re-pushing
 *  an already-pushed event returns `alreadyPushed: true` without rewriting the timestamp
 *  or stacking audit rows (the audit trail records the lever, not every replay). */
export async function directPushEvent(
  eventId: string,
  actor: DirectPushActor,
  reason: string | undefined,
  db: DB = defaultDb,
  now: Date = new Date(),
): Promise<DirectPushResult> {
  if (!can(actor.role, "event.directPush")) {
    throw new DirectPushForbiddenError(`role ${actor.role} lacks event.directPush`);
  }

  // Validate outside the transaction (rollback-inside-transaction hangs under bun +
  // node-postgres, see contributions.ts).
  const rows = await db
    .select({
      id: events.id,
      directPushAt: events.expertDirectPushAt,
      directPushBy: events.expertDirectPushBy,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new DirectPushNotFoundError(`event ${eventId} not found`);

  if (row.directPushAt) {
    return { eventId, alreadyPushed: true };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({
        expertDirectPushAt: now,
        expertDirectPushBy: actor.id,
        lastStrongSignalAt: now,
        updatedAt: now,
      })
      .where(eq(events.id, eventId));

    await recordAudit(tx, {
      action: "event.directPush",
      actorId: actor.id,
      targetType: "event",
      targetId: eventId,
      before: { directPushAt: null },
      after: { directPushAt: now.toISOString(), directPushBy: actor.id },
      reason: reason ?? null,
    });
  });

  return { eventId, alreadyPushed: false };
}
