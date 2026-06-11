// /api/events/[id]/comments — public comments endpoint (Slice 9).
//
// GET  → returns one sorted comment list: { sort, items }.
// POST → creates a comment (idempotent on event+user+bodyHash). Login is required
//        for writing; anonymous readers can still read and react elsewhere. Body is classified
//        deterministically before insert; low-value bodies are stored (so the rule
//        triggers idempotency on re-submission) but excluded from GET.
//
// Rate limit: per-IP token bucket from the shared publicLimiter. The bucket is shared
// across all /api/* endpoints intentionally — abuse is correlated across endpoints, so
// one global ceiling is better than per-endpoint generosity.

import { z, ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import {
  addComment,
  CommentIdentityError,
  EmptyBodyError,
  EventNotFoundError,
  InvalidParentError,
  listEventComments,
  parseCommentSort,
  type CommentRow,
  type CommentWithReplies,
} from "@/db/queries/comments";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 4000;

const bodySchema = z.object({
  body: z.string().min(1).max(MAX_BODY_CHARS),
  // SP3.1: when present, this comment is a reply to the given top-level comment.
  parentId: z.string().min(1).optional(),
});

/** Public-facing comment shape. Identity columns (userId/fingerprint) are omitted
 * deliberately: anonymous reactions/comments should not leak the cookie-id back to
 * other readers. The `isExpert` flag is the only identity-derived signal we expose. */
interface PublicComment {
  id: string;
  body: string;
  isExpert: boolean;
  likeCount: number;
  createdAt: string;
  replies?: PublicComment[];
}

function toPublic(row: CommentRow): PublicComment {
  return {
    id: row.id,
    body: row.body,
    isExpert: row.isExpert,
    likeCount: row.likeCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPublicWithReplies(row: CommentWithReplies): PublicComment {
  return { ...toPublic(row), replies: row.replies.map(toPublic) };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: eventId } = await ctx.params;
  if (!eventId) return jsonError(400, "invalid_event_id");
  const sort = parseCommentSort(new URL(req.url).searchParams.get("sort"));

  try {
    const sections = await listEventComments(eventId, { sort });
    const items = sections.items.map(toPublicWithReplies);
    const body = {
      sort: sections.sort,
      items,
      // Legacy section fields kept while inline/detail clients migrate.
      expertViews: [],
      highQuality: [],
      latest: items,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
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

  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return jsonError(401, "login_required");
  }

  try {
    const row = await addComment({
      eventId,
      body: parsed.body,
      identity: { userId, fingerprint: null },
      parentId: parsed.parentId ?? null,
    });
    return Response.json(toPublic(row), { status: 200 });
  } catch (err) {
    if (err instanceof EventNotFoundError) return jsonError(404, "event_not_found");
    if (err instanceof EmptyBodyError) return jsonError(400, "empty_body");
    if (err instanceof InvalidParentError) return jsonError(400, "invalid_parent");
    if (err instanceof CommentIdentityError) return jsonError(400, "invalid_identity");
    return jsonError(500, "internal_error");
  }
}
