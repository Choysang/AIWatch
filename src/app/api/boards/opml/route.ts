// GET /api/boards/opml — export the curated RSS-family sources as an OPML 2.0 download
// (v0.5 A4.1). Lets a reader take AIWatch's curation into their own feed reader. Only
// sources with a public, subscribable feed URL are included (see listExportableSources).
// Rate-limited per IP; cacheable (the curated pool changes slowly).

import { listExportableSources } from "@/db/queries/sources";
import { messages } from "@/i18n";
import { buildOpml } from "@/opml/build";
import { clientIp, jsonError, publicLimiter } from "../../public/_runtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = publicLimiter.check(`opml:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }
  try {
    const sources = await listExportableSources();
    const opml = buildOpml({
      title: `${messages.appName} 精选 RSS 信源`,
      outlines: sources.map((s) => ({
        text: s.name,
        xmlUrl: s.feedUrl,
        htmlUrl: s.htmlUrl,
        category: s.category,
      })),
    });
    return new Response(opml, {
      status: 200,
      headers: {
        "content-type": "text/x-opml; charset=utf-8",
        "content-disposition": 'attachment; filename="aiwatch-sources.opml"',
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return jsonError(500, "internal_error");
  }
}
