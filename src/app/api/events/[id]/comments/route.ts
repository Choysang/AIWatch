// /api/events/[id]/comments — public comments endpoint (Slice 9).
//
// GET  → returns three sections {expertViews, highQuality, latest}. CDN-cacheable.
// POST → creates a comment (idempotent on event+identity+bodyHash). Identity
//        precedence: session > rid cookie > IP+UA fingerprint. Body is classified
//        deterministically before insert; low-value bodies are stored (so the rule
//        triggers idempotency on re-submission) but excluded from GET.
//
// Rate limit: per-IP token bucket from the shared publicLimiter. The bucket is shared
// across all /api/* endpoints intentionally — abuse is correlated across endpoints, so
// one global ceiling is better than per-endpoint generosity.

import { z, ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { fingerprint } from "@/contributions/fingerprint";
import {
  addComment,
  CommentIdentityError,
  EmptyBodyError,
  EventNotFoundError,
  listEventComments,
  type CommentRow,
} from "@/db/queries/comments";
import { cacheControl, clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 4000;

const bodySchema = z.object({
  body: z.string().min(1).max(MAX_BODY_CHARS),
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

/** Public-facing comment shape. Identity columns (userId/fingerprint) are omitted
 * deliberately: anonymous reactions/comments should not leak the cookie-id back to
 * other readers. The `isExpert` flag is the only identity-derived signal we expose. */
interface PublicComment {
  id: string;
  body: string;
  isExpert: boolean;
  createdAt: string;
}

function toPublic(row: CommentRow): PublicComment {
  return {
    id: row.id,
    body: row.body,
    isExpert: row.isExpert,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: eventId } = await ctx.params;
  if (!eventId) return jsonError(400, "invalid_event_id");

  try {
    const sections = await listEventComments(eventId);
    const body = {
      expertViews: sections.expertViews.map(toPublic),
      highQuality: sections.highQuality.map(toPublic),
      latest: sections.latest.map(toPublic),
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": cacheControl(30, 120),
      },
    });
  } catch {
    return jsonError(500, "internal_error");
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: eventId } = await ctx.params;
  if (!eventId) return jsonError(400, "invalid_event_id");

  const ip = clientIp(req);
  const rl = publicLimiter.check(`comment:${ip}`);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", {
      "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(raw);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_body" : "invalid_body");
  }

  // Identity precedence mirrors reactions: session > rid cookie > IP+UA fp.
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
    const row = await addComment({
      eventId,
      body: parsed.body,
      identity: { userId, fingerprint: fp },
    });
    return Response.json(toPublic(row), { status: 200 });
  } catch (err) {
    if (err instanceof EventNotFoundError) return jsonError(404, "event_not_found");
    if (err instanceof EmptyBodyError) return jsonError(400, "empty_body");
    if (err instanceof CommentIdentityError) return jsonError(400, "invalid_identity");
    return jsonError(500, "internal_error");
  }
}
