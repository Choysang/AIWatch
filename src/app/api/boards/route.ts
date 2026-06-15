// GET  /api/boards  — list the current reader's topic boards (v0.5 A1).
// POST /api/boards  — create a board { name, tags[], emoji? }.
//
// Identity = resolveReaderIdentity (account > rid cookie > IP+UA fingerprint). Validated at
// the boundary; rate-limited per IP. The query layer re-normalizes and enforces limits.

import { z, ZodError } from "zod";
import { resolveReaderIdentity } from "@/app/_lib/reader-identity";
import {
  BoardIdentityError,
  BoardLimitError,
  BoardNameConflictError,
  createBoard,
  EmptyBoardNameError,
  listBoards,
} from "@/db/queries/topic-boards";
import { clientIp, jsonError, publicLimiter } from "../public/_runtime";

export const dynamic = "force-dynamic";

// Generous boundary bounds; the query layer trims/caps to the real limits (name<=40,
// 20 tags). We just reject obviously abusive payloads before touching the DB.
const createSchema = z.object({
  name: z.string().min(1).max(200),
  tags: z.array(z.string().max(200)).max(100).optional().default([]),
  sourceIds: z.array(z.string().max(64)).max(200).optional().default([]),
  emoji: z.string().max(40).nullish(),
});

function rateLimited(ip: string): Response | null {
  const rl = publicLimiter.check(`boards:${ip}`);
  if (rl.allowed) return null;
  return jsonError(429, "rate_limited", { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
}

export async function GET(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limited = rateLimited(ip);
  if (limited) return limited;
  try {
    const identity = await resolveReaderIdentity(req, ip);
    const boards = await listBoards(identity);
    return Response.json({ boards }, { status: 200 });
  } catch (err) {
    if (err instanceof BoardIdentityError) return jsonError(400, "no_identity");
    return jsonError(500, "internal_error");
  }
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const limited = rateLimited(ip);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(body);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_body" : "invalid_body");
  }

  try {
    const identity = await resolveReaderIdentity(req, ip);
    const board = await createBoard(identity, {
      name: parsed.name,
      tags: parsed.tags,
      sourceIds: parsed.sourceIds,
      emoji: parsed.emoji ?? null,
    });
    return Response.json({ board }, { status: 201 });
  } catch (err) {
    if (err instanceof BoardIdentityError) return jsonError(400, "no_identity");
    if (err instanceof EmptyBoardNameError) return jsonError(400, "empty_name");
    if (err instanceof BoardLimitError) return jsonError(409, "board_limit");
    if (err instanceof BoardNameConflictError) return jsonError(409, "name_conflict");
    return jsonError(500, "internal_error");
  }
}
