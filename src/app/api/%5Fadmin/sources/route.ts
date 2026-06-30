// POST /api/_admin/sources — create, archive, and smoke-test curated sources.
// New sources are enabled only after their connector returns at least one item (manual
// sources are exempt because they are hand-filled). The same endpoint also powers the
// admin "retest" button for failed sources.

import { getSession, isAdminRole } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import { can } from "@/auth/rbac";
import { recordAudit } from "@/db/audit";
import { db } from "@/db/client";
import {
  archiveSources,
  createSource,
  getManagedSourceById,
  markSourceImportFailure,
} from "@/db/queries/sources";
import { checkManagedSourceFetchHealth } from "@/sources/source-health-check";
import { sourceFormSchema, toCreateSourceInput } from "@/sources/source-form";

export const dynamic = "force-dynamic";

function redirectBack(path: string): Response {
  return new Response(null, { status: 303, headers: { location: path } });
}

function sourceIdsFromForm(form: FormData, max = 100): string[] {
  return form
    .getAll("sourceIds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);
}

async function smokeTestSource(sourceId: string): Promise<{ ok: boolean; error: string | null }> {
  const row = await getManagedSourceById(sourceId);
  if (!row) return { ok: false, error: "source not found after create" };
  if (row.connectorType === "manual") return { ok: true, error: null };

  const checked = await checkManagedSourceFetchHealth(row, { force: true });
  if (checked.healthStatus === "healthy" && !checked.lastError) return { ok: true, error: null };
  const error = checked.lastError ?? "source smoke test failed";
  await markSourceImportFailure(sourceId, error);
  return { ok: false, error };
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");
  if (!isAdminRole(role)) return jsonError(403, "forbidden");
  if (!can(role, "source.moderate")) return jsonError(403, "forbidden");

  const form = await req.formData();
  const action = form.get("_action");

  if (action === "delete") {
    const sourceIds = sourceIdsFromForm(form);
    const archived = await db.transaction(async (tx) => {
      const archivedSources = await archiveSources(sourceIds, tx);
      for (const source of archivedSources) {
        await recordAudit(tx, {
          action: "source.archive",
          actorId: userId,
          targetType: "source",
          targetId: source.id,
          before: source,
          after: { archived: true, enabled: false },
          reason: "manual source deletion",
        });
      }
      return archivedSources;
    });

    return redirectBack(`/_admin?deleted=${archived.length}`);
  }

  if (action === "retry") {
    let ok = 0;
    let failed = 0;
    for (const sourceId of sourceIdsFromForm(form, 20)) {
      const row = await getManagedSourceById(sourceId);
      if (!row) {
        failed += 1;
        continue;
      }
      const checked = await checkManagedSourceFetchHealth(row, { force: true });
      if (checked.healthStatus === "healthy" && !checked.lastError) ok += 1;
      else failed += 1;
      await recordAudit(db, {
        action: "source.retry_health",
        actorId: userId,
        targetType: "source",
        targetId: sourceId,
        after: { healthStatus: checked.healthStatus, lastError: checked.lastError },
        reason: "manual source health retest",
      });
    }
    return redirectBack(`/_admin?retried=${ok}&retryFailed=${failed}`);
  }

  const parsed = sourceFormSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return redirectBack("/_admin?error=invalid-source");
  }

  const input = parsed.data;
  const sourceInput = toCreateSourceInput(input);
  const id = await createSource(sourceInput);
  const smoke = await smokeTestSource(id);

  await recordAudit(db, {
    action: "source.create",
    actorId: userId,
    targetType: "source",
    targetId: id,
    after: {
      name: input.name,
      platform: input.platform,
      connectorType: sourceInput.connectorType,
      connectorRef: sourceInput.connectorRef,
      recommendedBy: input.recommendedBy ?? null,
      smokeTest: smoke,
    },
    reason: smoke.ok ? "manual source onboarding" : "manual source onboarding failed smoke test",
  });

  return smoke.ok
    ? redirectBack("/_admin?created=1")
    : redirectBack(`/_admin?created=0&error=source-smoke&sourceId=${encodeURIComponent(id)}`);
}