// GET /api/public/daily/{date} — published daily report for an exact calendar date
// (YYYY-MM-DD in APP_TZ; decision E). Read-only, no key. Invalid dates -> 400.

import { isCalendarDate } from "@/core/time";
import { getDailyByDate } from "@/db/queries/public-reports";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../../_runtime";
import { requestOrigin, withReportItemPermalinks } from "../../_links";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
): Promise<Response> {
  const rl = publicLimiter.check(clientIp(req));
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  const { date } = await ctx.params;
  if (!isCalendarDate(date)) return jsonError(400, "invalid_date");

  try {
    const report = await getDailyByDate(date);
    if (!report) return jsonError(404, "no_report");
    return Response.json(withReportItemPermalinks(report, requestOrigin(new URL(req.url))), {
      headers: { "cache-control": cacheControl(300, 3600) },
    });
  } catch {
    return jsonError(500, "internal_error");
  }
}
