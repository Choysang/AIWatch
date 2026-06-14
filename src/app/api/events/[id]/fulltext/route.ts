// GET /api/events/[id]/fulltext — on-demand full-text for the 全文 reading layer (v0.5 B1).
// Extracts + caches the event's main-article body via readability on first request, serves
// the cache after. Returns { status: "ok" | "empty" | "error" | "unavailable", text }.
// Rate-limited per IP (extraction reaches out to an external origin).

import { getOrExtractFulltext } from "@/db/queries/article-fulltext";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") return jsonError(400, "invalid_event_id");

  const ip = clientIp(req);
  const rl = publicLimiter.check(`fulltext:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }

  try {
    const result = await getOrExtractFulltext(id);
    return Response.json(result, {
      status: 200,
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch {
    return jsonError(500, "internal_error");
  }
}
