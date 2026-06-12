// POST /api/events/[id]/reactions — public user-feedback endpoint (Slice 7/8).
//
// Body: { kind: "like" | "star" | "down", op: "add" | "remove" }
// Identity precedence (Slice 8): logged-in session > signed `rid` cookie > salted IP+UA
// fingerprint fallback. The cookie path is preferred because per-IP+UA collapses every
// anonymous reader behind the same NAT into one identity. We *do not* mint the cookie
// here on POST — that happens on the SSR reader page (so a returning reader who blocks
// cookies still gets a stable-per-session fingerprint, but a cookie-enabled reader gets
// a stable-per-device identity from the moment they load the feed).
// Idempotent: add when present (or remove when absent) returns current counts.
// Rate-limited per-IP.

import { z, ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { fingerprint } from "@/contributions/fingerprint";
import {
  addReaction,
  EventNotFoundError,
  removeReaction,
} from "@/db/queries/reactions";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["like", "star", "down"]),
  op: z.enum(["add", "remove"]),
});

/** Parse a Cookie header for a single named cookie. Returns the raw value or null. */
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

  // Identity precedence: session → rid cookie → IP+UA fingerprint.
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
      {
        likeCount: result.likeCount,
        starCount: result.starCount,
        downCount: result.downCount,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return jsonError(404, "event_not_found");
    }
    return jsonError(500, "internal_error");
  }
}
