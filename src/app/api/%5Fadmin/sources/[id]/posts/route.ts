// POST /api/_admin/sources/{id}/posts — hand-enter a post for an existing source.
// The input is validated server-side, then ingested through processSource via
// ingestManualPost so judging, scoring, dedup and spend_guard remain identical to crawls.

import { getSession, isAdminRole } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import { can } from "@/auth/rbac";
import { recordAudit } from "@/db/audit";
import { db } from "@/db/client";
import { ingestManualPost, SourceNotFoundError } from "@/sources/manual-ingest";
import { manualPostInputSchema } from "@/sources/manual-post";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");
  if (!isAdminRole(role)) return jsonError(403, "forbidden");
  if (!can(role, "source.moderate")) return jsonError(403, "forbidden");

  const { id } = await ctx.params;
  const form = await req.formData();
  const parsed = manualPostInputSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return Response.redirect(new URL(`/_admin/sources?postError=invalid&source=${id}`, req.url), 303);
  }

  try {
    const summary = await ingestManualPost(id, parsed.data, { db });
    await recordAudit(db, {
      action: "source.manual_post",
      actorId: userId,
      targetType: "source",
      targetId: id,
      after: {
        url: parsed.data.url,
        summary,
      },
      reason: "manual source post ingestion",
    });
    const target = new URL("/_admin/sources", req.url);
    target.searchParams.set("post", "1");
    target.searchParams.set("newEvents", String(summary.newEvents));
    target.searchParams.set("failed", String(summary.failed));
    return Response.redirect(target, 303);
  } catch (err) {
    if (err instanceof SourceNotFoundError) return jsonError(404, "not_found");
    return jsonError(409, "conflict");
  }
}
