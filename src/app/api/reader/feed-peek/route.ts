import { getSession, isAdminRole } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import { searchEvents, type FeedFilter } from "@/db/queries/feed";
import { parsePublicQuery, type PublicQuery } from "@/public/query";

export const dynamic = "force-dynamic";

function toFeedFilter(query: PublicQuery, hideOwnerAnnotated: boolean): FeedFilter {
  return {
    mode: query.mode,
    since: query.since,
    q: query.q,
    tags: query.tags,
    sourceTypes: query.sourceTypes,
    sourceCategories: query.sourceCategories,
    sourceIds: query.sourceIds,
    interests: query.interests,
    contentTypes: query.contentTypes,
    level: query.level,
    minScore: query.minScore,
    category: query.category,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    hideOwnerAnnotated,
  };
}

async function canReviewOwnerAnnotations(): Promise<boolean> {
  try {
    const session = await getSession();
    const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
    return isAdminRole(role);
  } catch {
    return false;
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = parsePublicQuery(url.searchParams);
  try {
    const events = await searchEvents(toFeedFilter(query, await canReviewOwnerAnnotations()), 1);
    return Response.json({
      items: events.map((event) => ({
        id: event.id,
        published_at: event.publishedAt?.toISOString() ?? null,
        promoted_at: event.promotedAt?.toISOString() ?? null,
      })),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return jsonError(500, "internal_error");
  }
}
