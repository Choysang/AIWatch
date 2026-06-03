// POST /api/notifications/read — mark notifications read (SP3.3 point 7).
//
// Body: { ids?: string[] }. With ids, marks only those; without (or empty body), marks all
// of the caller's unread notifications. markRead scopes every update to the session user, so
// a caller can never clear someone else's rows. Logged-in only.

import { z, ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import { markRead } from "@/db/queries/notifications";
import { jsonError } from "@/app/api/public/_runtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(200).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return jsonError(401, "unauthorized");

  // An empty/absent body means "mark all" — tolerate non-JSON bodies for that ergonomic path.
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(raw ?? {});
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_body" : "invalid_body");
  }

  try {
    const marked = await markRead(userId, { ids: parsed.ids });
    return Response.json({ marked });
  } catch {
    return jsonError(500, "internal_error");
  }
}
