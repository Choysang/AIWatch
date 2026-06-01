// POST /api/_admin/sources — create a curated source (Task 3, manual onboarding).
// Enforces login + the source.moderate capability, validates the form server-side, writes
// the source plus an audit row, then 303-redirects back to the management console. The
// folder is %5Fadmin so it serves at the literal /api/_admin path (unlinked from public nav).

import { getSession } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import { can } from "@/auth/rbac";
import { recordAudit } from "@/db/audit";
import { db } from "@/db/client";
import { archiveSources, createSource } from "@/db/queries/sources";
import { sourceFormSchema, toCreateSourceInput } from "@/sources/source-form";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");
  if (!can(role, "source.moderate")) return jsonError(403, "forbidden");

  const form = await req.formData();
  if (form.get("_action") === "delete") {
    const sourceIds = form
      .getAll("sourceIds")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 100);
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

    return Response.redirect(new URL(`/_admin?deleted=${archived.length}`, req.url), 303);
  }

  const parsed = sourceFormSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return Response.redirect(new URL("/_admin?error=invalid-source", req.url), 303);
  }

  const input = parsed.data;
  const sourceInput = toCreateSourceInput(input);
  const id = await createSource(sourceInput);

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
    },
    reason: "manual source onboarding",
  });

  return Response.redirect(new URL("/_admin?created=1", req.url), 303);
}
