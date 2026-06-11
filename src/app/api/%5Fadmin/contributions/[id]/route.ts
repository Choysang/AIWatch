// POST /api/_admin/contributions/{id} — admin review action (decision 14). Form-encoded
// `action` (triage|approve|reject|apply|approve_apply) + optional `note`. Enforces login
// + the RBAC capability map (in the job) and the review state machine; every action is audited.
// The folder is %5Fadmin so it serves at the literal /api/_admin path (unlinked).

import { getSession, isAdminRole } from "@/app/_lib/session";
import {
  applyContribution,
  ForbiddenError,
  NotFoundError,
  reviewContribution,
} from "@/db/jobs/contributions";
import { jsonError } from "@/app/api/public/_runtime";
import { sourceFormSchema, toCreateSourceInput } from "@/sources/source-form";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");
  if (!isAdminRole(role)) return jsonError(403, "forbidden");

  const { id } = await ctx.params;
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const noteRaw = form.get("note");
  const note = noteRaw ? String(noteRaw) : undefined;
  const reviewer = { id: userId, role };

  try {
    if (action === "approve_apply") {
      const parsed = sourceFormSchema.safeParse(Object.fromEntries(form.entries()));
      if (!parsed.success) {
        return Response.redirect(new URL("/_admin?error=invalid-source-review", req.url), 303);
      }
      try {
        await reviewContribution(id, "approve", reviewer, note);
      } catch (err) {
        if (err instanceof ForbiddenError || err instanceof NotFoundError) throw err;
      }
      await applyContribution(id, reviewer, note, toCreateSourceInput(parsed.data));
    } else if (action === "apply") {
      await applyContribution(id, reviewer, note);
    } else if (action === "triage" || action === "approve" || action === "reject") {
      await reviewContribution(id, action, reviewer, note);
    } else {
      return jsonError(400, "invalid_action");
    }
  } catch (err) {
    if (err instanceof ForbiddenError) return jsonError(403, "forbidden");
    if (err instanceof NotFoundError) return jsonError(404, "not_found");
    return jsonError(409, "conflict"); // illegal transition or unsupported apply
  }

  // 303 -> browser GETs the console after the POST.
  return Response.redirect(new URL("/_admin", req.url), 303);
}
