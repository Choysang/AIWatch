import { listBriefItems } from "@/db/queries/brief";
import { EVENT_CATEGORIES, windowStart, type EventCategory } from "@/public/query";
import { EVENT_TIERS, type EventTier } from "@/pipeline/judge-schema";
import { renderRssFeed } from "@/public/rss";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../../public/_runtime";

export const dynamic = "force-dynamic";

const CATEGORY_SET: ReadonlySet<string> = new Set(EVENT_CATEGORIES);
const TIER_SET: ReadonlySet<string> = new Set(EVENT_TIERS);

function parseSince(raw: string | null, now: Date): Date | null {
  if (!raw || raw === "all") return null;
  if (raw === "today" || raw === "week" || raw === "month") return windowStart(raw, now);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(req: Request): Promise<Response> {
  const rl = publicLimiter.check(clientIp(req));
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  const url = new URL(req.url);
  const categoryRaw = url.searchParams.get("category")?.trim();
  const tierRaw = url.searchParams.get("tier")?.trim();
  const now = new Date();

  const items = await listBriefItems({
    category: categoryRaw && CATEGORY_SET.has(categoryRaw) ? (categoryRaw as EventCategory) : undefined,
    tier: tierRaw && TIER_SET.has(tierRaw) ? (tierRaw as EventTier) : undefined,
    since: parseSince(url.searchParams.get("since"), now),
    sort: "default",
    take: 50,
  });

  const origin = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || url.origin;
  const xml = renderRssFeed(items, { origin });

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": cacheControl(60, 300),
    },
  });
}
