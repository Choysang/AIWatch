// GET /api/public/hotspots — anonymous read-only current multi-source topics.

import { listCurrentHotspots } from "@/db/queries/current-hotspots";
import { searchEvents } from "@/db/queries/feed";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../_runtime";
import { absoluteEventPermalink, requestOrigin } from "../_links";

export const dynamic = "force-dynamic";

const HOTSPOT_CANDIDATE_LIMIT = 160;

export async function GET(req: Request): Promise<Response> {
  const rl = publicLimiter.check(clientIp(req));
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  try {
    const recent = await searchEvents({ mode: "all", since: "week" }, HOTSPOT_CANDIDATE_LIMIT);
    const origin = requestOrigin(new URL(req.url));
    const hotspots = await listCurrentHotspots(recent.map((event) => event.id));
    return Response.json(
      {
        items: hotspots.map((item) => ({
          id: item.id,
          title: item.title,
          source_count: item.sourceCount,
          mention_count: item.mentionCount,
          source_names: item.sourceNames,
          score: item.score,
          keywords: item.keywords,
          last_seen_at: item.lastSeenAt.toISOString(),
          permalink: absoluteEventPermalink(origin, item.id),
        })),
      },
      { headers: { "cache-control": cacheControl(30, 120) } },
    );
  } catch {
    return jsonError(500, "internal_error");
  }
}
