// GET /api/public/dailies — recent published daily reports, newest first (decision 13).
// Lightweight list (no sections); ?take=N capped server-side. Read-only, no key.

import { listDailies } from "@/db/queries/public-reports";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../_runtime";
import { requestOrigin, withDailyArchivePermalinks } from "../_links";

export const dynamic = "force-dynamic";

const DEFAULT_TAKE = 14;

export async function GET(req: Request): Promise<Response> {
  const rl = publicLimiter.check(clientIp(req));
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  const takeRaw = Number(new URL(req.url).searchParams.get("take"));
  const take = Number.isFinite(takeRaw) && takeRaw > 0 ? takeRaw : DEFAULT_TAKE;

  try {
    const dailies = await listDailies(take);
    return Response.json(
      { dailies: withDailyArchivePermalinks(dailies, requestOrigin(new URL(req.url))) },
      { headers: { "cache-control": cacheControl(300, 3600) } },
    );
  } catch {
    return jsonError(500, "internal_error");
  }
}
