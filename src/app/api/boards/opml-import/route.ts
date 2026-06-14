// POST /api/boards/opml-import — bulk-suggest the feeds in an uploaded OPML document as
// source recommendations (v0.5 A4.2). Respects the curated-pool boundary: nothing goes live
// here; each feed lands as a `source_recommendation` contribution (status submitted) that the
// owner reviews — the same intake as /recommend-source, so the hourly digest already notifies.
// Body = raw OPML text. Capped (bytes + feed count) and rate-limited per IP.

import { ZodError } from "zod";
import { resolveReaderIdentity } from "@/app/_lib/reader-identity";
import { parseSubmission } from "@/contributions/schema";
import { submitContribution } from "@/db/jobs/contributions";
import { log } from "@/log";
import { MAX_IMPORT_FEEDS, parseOpml } from "@/opml/parse";
import { clientIp, jsonError, publicLimiter } from "../../public/_runtime";

export const dynamic = "force-dynamic";

const MAX_OPML_BYTES = 512 * 1024; // 512 KB — generous for an OPML file, bounds abuse.

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = publicLimiter.check(`opml-import:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return jsonError(400, "invalid_body");
  }
  if (!raw.trim()) return jsonError(400, "empty");
  if (raw.length > MAX_OPML_BYTES) return jsonError(413, "too_large");

  const feeds = parseOpml(raw, MAX_IMPORT_FEEDS);
  if (feeds.length === 0) return jsonError(422, "no_feeds");

  // Best-effort submitter identity so the owner can see who imported (never trusted).
  const identity = await resolveReaderIdentity(req, ip);
  const contributor = { userId: identity.userId, fingerprint: identity.fingerprint };

  let submitted = 0;
  for (const feed of feeds) {
    try {
      const parsed = parseSubmission({
        kind: "source_recommendation",
        reason: "OPML 批量导入",
        proposedChange: {
          url: feed.xmlUrl,
          name: feed.title,
          platform: "rss",
          recommendReason: feed.htmlUrl ? `OPML 导入 · 主页 ${feed.htmlUrl}` : "OPML 导入",
        },
      });
      await submitContribution(parsed, contributor);
      submitted += 1;
    } catch (err) {
      // A single bad feed (e.g. a URL Zod rejects) must not fail the batch. Zod = expected;
      // anything else is logged (not silently swallowed) but still skipped.
      if (!(err instanceof ZodError)) {
        log.warn("[opml-import] feed submit failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (submitted === 0) return jsonError(422, "no_feeds");
  return Response.json({ submitted, total: feeds.length }, { status: 201 });
}
