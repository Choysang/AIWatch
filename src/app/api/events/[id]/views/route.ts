// POST /api/events/[id]/views — count a reader opening details or the original source.
// This is intentionally a click counter, not a unique-user metric.

import { z } from "zod";
import { EventNotFoundError } from "@/db/queries/reactions";
import { incrementEventView } from "@/db/queries/views";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["detail", "source"]).optional(),
});

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

  try {
    const result = await incrementEventView(eventId);
    return Response.json({ viewCount: result.viewCount }, { status: 200 });
  } catch (err) {
    if (err instanceof EventNotFoundError) return jsonError(404, "event_not_found");
    return jsonError(500, "internal_error");
  }
}
