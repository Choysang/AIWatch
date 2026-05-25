// Audit log writer (spec: Audit Requirements). append-only. Accepts a db or a tx so a
// sensitive action and its audit row commit atomically. Secret values are never passed
// here — log the check, not the secret (decision 11).

import { newId } from "@/core/ids";
import type { DB, Tx } from "@/db/client";
import { auditLogs } from "@/db/schema";

export interface AuditEntry {
  action: string;
  actorId?: string | null; // null = system/automated
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function recordAudit(exec: DB | Tx, entry: AuditEntry): Promise<void> {
  await exec.insert(auditLogs).values({
    id: newId("aud"),
    action: entry.action,
    actorId: entry.actorId ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}
