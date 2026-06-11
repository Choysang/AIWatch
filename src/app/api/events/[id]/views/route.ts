// POST /api/events/[id]/views — count a reader opening details or the original source.
// Deduped per event + viewer identity so repeated POSTs cannot inflate the counter.

import { z } from "zod";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { fingerprint } from "@/contributions/fingerprint";
import { EventNotFoundError } from "@/db/queries/reactions";
import { recordEventView } from "@/db/queries/views";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["detail", "source"]).optional(),
});

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(/;\s*/)) {
    if (part.startsWith(prefix)) return part.slice(prefix.length);
  }
  return null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: eventId } = await ctx.params;
  if (!eventId || typeof eventId !== "string") {
    return jsonError(400, "invalid_event_id");
  }

  const ip = clientIp(req);
  const rl = publicLimiter.check(`view:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  try {
    const body = await req.json();
    bodySchema.parse(body);
  } catch {
    // Some sendBeacon implementations can omit a JSON content-type. The counter does not
    // depend on the kind, so malformed bodies are ignored rather than dropping the click.
  }

  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }

  let fp: string | null = null;
  if (!userId) {
    const ridRaw = readCookie(req, READER_ID_COOKIE);
    const rid = await verifyReaderId(ridRaw);
    fp = rid ?? fingerprint(ip, req.headers.get("user-agent") ?? "");
  }

  try {
    const result = await recordEventView({
      eventId,
      identity: { userId, fingerprint: fp },
    });
    return Response.json({ viewCount: result.viewCount }, { status: 200 });
  } catch (err) {
    if (err instanceof EventNotFoundError) return jsonError(404, "event_not_found");
    return jsonError(500, "internal_error");
  }
}
