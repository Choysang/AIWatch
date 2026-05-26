// POST /api/events/[id]/reactions — public user-feedback endpoint (Slice 7).
//
// Body: { kind: "like" | "star", op: "add" | "remove" }
// Identity = logged-in user session OR anonymous salted IP+UA fingerprint (XOR).
// Idempotent: add when already present (or remove when absent) returns current counts
// without error. Returns { likeCount, starCount }. Rate-limited per-IP.

import { z, ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import { fingerprint } from "@/contributions/fingerprint";
import {
  addReaction,
  EventNotFoundError,
  removeReaction,
} from "@/db/queries/reactions";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["like", "star"]),
  op: z.enum(["add", "remove"]),
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
  const rl = publicLimiter.check(`react:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(body);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_body" : "invalid_body");
  }

  // Identity: prefer session; fall back to anonymous fingerprint. Never trust client.
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  const fp = userId ? null : fingerprint(ip, req.headers.get("user-agent") ?? "");

  try {
    const result =
      parsed.op === "add"
        ? await addReaction({
            eventId,
            kind: parsed.kind,
            identity: { userId, fingerprint: fp },
          })
        : await removeReaction({
            eventId,
            kind: parsed.kind,
            identity: { userId, fingerprint: fp },
          });
    return Response.json(
      { likeCount: result.likeCount, starCount: result.starCount },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return jsonError(404, "event_not_found");
    }
    return jsonError(500, "internal_error");
  }
}
