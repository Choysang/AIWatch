// GET /api/notifications/preview — compact unread list for the masthead bell hover.
// Anonymous readers have no inbox, so the route returns an empty preview instead of 401.

import { getSession } from "@/app/_lib/session";
import { countUnread, listUnreadPreview } from "@/db/queries/notifications";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return Response.json({ count: 0, items: [] });

  try {
    const [count, items] = await Promise.all([
      countUnread(userId),
      listUnreadPreview(userId, { limit: 5 }),
    ]);
    return Response.json({
      count,
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        eventId: item.eventId,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch {
    return Response.json({ count: 0, items: [] });
  }
}
