import { listBriefItems } from "@/db/queries/brief";
import { EVENT_CATEGORIES, windowStart, type EventCategory } from "@/public/query";
import { EVENT_TIERS, type EventTier } from "@/pipeline/judge-schema";
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
  const sortRaw = url.searchParams.get("sort")?.trim();
  const takeRaw = Number(url.searchParams.get("take"));
  const now = new Date();

  const items = await listBriefItems({
    category: categoryRaw && CATEGORY_SET.has(categoryRaw) ? (categoryRaw as EventCategory) : undefined,
    tier: tierRaw && TIER_SET.has(tierRaw) ? (tierRaw as EventTier) : undefined,
    since: parseSince(url.searchParams.get("since"), now),
    sort: sortRaw === "time" ? "time" : "default",
    take: Number.isFinite(takeRaw) ? takeRaw : undefined,
  });

  return Response.json(
    { items },
    { headers: { "cache-control": cacheControl(30, 120) } },
  );
}
