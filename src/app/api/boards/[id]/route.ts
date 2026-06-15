// PATCH  /api/boards/[id]  — update { name?, tags?, emoji?, sortOrder? } (v0.5 A1).
// DELETE /api/boards/[id]  — delete a board.
//
// Owner-scoped: a missing board OR one owned by another identity both resolve to 404, so
// the endpoint never leaks whether an id exists. Rate-limited per IP.

import { z, ZodError } from "zod";
import { resolveReaderIdentity } from "@/app/_lib/reader-identity";
import {
  BoardIdentityError,
  BoardNameConflictError,
  BoardNotFoundError,
  deleteBoard,
  EmptyBoardNameError,
  updateBoard,
} from "@/db/queries/topic-boards";
import { clientIp, jsonError, publicLimiter } from "../../public/_runtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().max(200)).max(100).optional(),
  sourceIds: z.array(z.string().max(64)).max(200).optional(),
  // nullish: omitted leaves the emoji unchanged; explicit null clears it.
  emoji: z.string().max(40).nullish(),
  sortOrder: z.number().int().optional(),
});

function rateLimited(ip: string): Response | null {
  const rl = publicLimiter.check(`boards:${ip}`);
  if (rl.allowed) return null;
  return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") return jsonError(400, "invalid_id");
  const ip = clientIp(req);
  const limited = rateLimited(ip);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(body);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_body" : "invalid_body");
  }

  try {
    const identity = await resolveReaderIdentity(req, ip);
    const board = await updateBoard(identity, id, {
      name: parsed.name,
      tags: parsed.tags,
      sourceIds: parsed.sourceIds,
      emoji: parsed.emoji,
      sortOrder: parsed.sortOrder,
    });
    return Response.json({ board }, { status: 200 });
  } catch (err) {
    if (err instanceof BoardIdentityError) return jsonError(400, "no_identity");
    if (err instanceof BoardNotFoundError) return jsonError(404, "not_found");
    if (err instanceof EmptyBoardNameError) return jsonError(400, "empty_name");
    if (err instanceof BoardNameConflictError) return jsonError(409, "name_conflict");
    return jsonError(500, "internal_error");
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") return jsonError(400, "invalid_id");
  const ip = clientIp(req);
  const limited = rateLimited(ip);
  if (limited) return limited;

  try {
    const identity = await resolveReaderIdentity(req, ip);
    await deleteBoard(identity, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof BoardIdentityError) return jsonError(400, "no_identity");
    if (err instanceof BoardNotFoundError) return jsonError(404, "not_found");
    return jsonError(500, "internal_error");
  }
}
