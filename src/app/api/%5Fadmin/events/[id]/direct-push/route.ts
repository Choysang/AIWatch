// POST /api/_admin/events/{id}/direct-push — expert direct-push to B (Scoring Integrity).
// Form-encoded optional `reason`. Enforces login + event.directPush capability (in the
// job). Every push writes an audit row. The folder is %5Fadmin so it serves at the literal
// /api/_admin path (unlinked from public nav). The flag is honored on the NEXT
// checkPromotion run (the route doesn't trigger a tournament — it just stamps the lever).

import { getSession } from "@/app/_lib/session";
import {
  DirectPushForbiddenError,
  DirectPushNotFoundError,
  directPushEvent,
} from "@/db/jobs/direct-push";
import { jsonError } from "@/app/api/public/_runtime";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");

  const { id } = await ctx.params;
  const form = await req.formData();
  const reasonRaw = form.get("reason");
  const reason = reasonRaw ? String(reasonRaw) : undefined;

  try {
    await directPushEvent(id, { id: userId, role }, reason);
  } catch (err) {
    if (err instanceof DirectPushForbiddenError) return jsonError(403, "forbidden");
    if (err instanceof DirectPushNotFoundError) return jsonError(404, "not_found");
    return jsonError(409, "conflict");
  }

  return Response.redirect(new URL("/_admin", req.url), 303);
}
