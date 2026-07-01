// GET /api/public/daily — latest published daily report (decision 13). Read-only, no key.
// Reports are quasi-static once published, so they cache longer than the items feed.

import { getLatestDaily } from "@/db/queries/public-reports";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../_runtime";
import { requestOrigin, withReportItemPermalinks } from "../_links";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const rl = publicLimiter.check(clientIp(req));
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  try {
    const report = await getLatestDaily();
    if (!report) return jsonError(404, "no_report");
    return Response.json(withReportItemPermalinks(report, requestOrigin(new URL(req.url))), {
      headers: { "cache-control": cacheControl(300, 3600) },
    });
  } catch {
    return jsonError(500, "internal_error");
  }
}
