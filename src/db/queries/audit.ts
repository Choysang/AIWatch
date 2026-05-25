// Audit log read query for the admin console (spec: "inspect audit logs").

import { desc } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { auditLogs } from "@/db/schema";

export interface AuditRow {
  id: string;
  action: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: Date;
}

export async function listAuditLogs(take = 100, db: DB = defaultDb): Promise<AuditRow[]> {
  const capped = Math.min(Math.max(1, Math.floor(take)), 500);
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorId: auditLogs.actorId,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      reason: auditLogs.reason,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(capped);
  return rows;
}
