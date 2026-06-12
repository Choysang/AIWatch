// POST /api/comments/[id]/reactions — like/unlike a comment (SP3.1 point 7).
//
// Body: { op: "add" | "remove" }. Kind is always "like" in V1 (KISS — no star/downvote
// on comments). Identity precedence mirrors event reactions: logged-in session > signed
// `rid` cookie > salted IP+UA fingerprint fallback. Idempotent + rate-limited per-IP.

import { z, ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { fingerprint } from "@/contributions/fingerprint";
import {
  addCommentReaction,
  CommentNotFoundError,
  removeCommentReaction,
} from "@/db/queries/comment-reactions";
import { clientIp, jsonError, publicLimiter } from "../../../public/_runtime";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
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
  const { id: commentId } = await ctx.params;
  if (!commentId) return jsonError(400, "invalid_comment_id");

  const ip = clientIp(req);
  const rl = publicLimiter.check(`comment-react:${ip}`);
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
        ? await addCommentReaction({ commentId, identity: { userId, fingerprint: fp } })
        : await removeCommentReaction({ commentId, identity: { userId, fingerprint: fp } });
    return Response.json({ commentId: result.commentId, likeCount: result.likeCount }, { status: 200 });
  } catch (err) {
    if (err instanceof CommentNotFoundError) return jsonError(404, "comment_not_found");
    return jsonError(500, "internal_error");
  }
}
