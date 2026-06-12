// POST /api/contributions — public submission (decision 14: public submit, review-gated).
// No content goes live here; it lands as `submitted`. Validated at the boundary; rate-
// limited; anonymous submissions are grouped by a salted fingerprint, logged-in ones by
// account.

import { ZodError } from "zod";
import { getSession } from "@/app/_lib/session";
import { fingerprint } from "@/contributions/fingerprint";
import { parseSubmission } from "@/contributions/schema";
import { submitContribution } from "@/db/jobs/contributions";
import { clientIp, jsonError, publicLimiter } from "../public/_runtime";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = publicLimiter.check(`contrib:${ip}`);
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

  let parsed;
  try {
    parsed = parseSubmission(body);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_submission" : "invalid_submission");
  }

  // Optional account; outside the Next request context (e.g. tests) this falls back to
  // anonymous, which is correct — submission never trusts client-claimed identity.
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  const fp = userId ? null : fingerprint(ip, req.headers.get("user-agent") ?? "");

  try {
    const result = await submitContribution(parsed, { userId, fingerprint: fp });
    return Response.json(result, { status: 201 });
  } catch {
    return jsonError(500, "internal_error");
  }
}
