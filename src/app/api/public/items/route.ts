// GET /api/public/items — read-only, no API key (decision 13). Cursor pagination with
// hard caps; semantic windows resolved server-side. CDN cache is the primary defense;
// the per-IP token bucket is abuse-grade backup.

import { listPublicItems } from "@/db/queries/public-items";
import { parsePublicQuery } from "@/public/query";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../_runtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const rl = publicLimiter.check(clientIp(req));
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  const q = parsePublicQuery(new URL(req.url).searchParams);

  try {
    const result = await listPublicItems(q, new Date());
    // Selected lists are scarcer/stabler -> cache longer than the firehose `all` feed.
    const [sMaxage, swr] = q.mode === "selected" ? [60, 300] : [30, 120];
    return Response.json(result, { headers: { "cache-control": cacheControl(sMaxage, swr) } });
  } catch {
    return jsonError(500, "internal_error");
  }
}
