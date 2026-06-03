// GET /api/notifications/unread-count — the bell badge (SP3.3 point 7).
//
// Logged-in only: anonymous readers have no inbox, so we answer { count: 0 } rather than
// 401 so the client bell can poll harmlessly without branching on auth. Degrades to 0 if
// the DB is unreachable — a missing badge is better than a crashed masthead.

import { getSession } from "@/app/_lib/session";
import { countUnread } from "@/db/queries/notifications";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return Response.json({ count: 0 });

  try {
    return Response.json({ count: await countUnread(userId) });
  } catch {
    return Response.json({ count: 0 });
  }
}
