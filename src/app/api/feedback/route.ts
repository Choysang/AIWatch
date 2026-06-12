// POST /api/feedback — anonymous reader feedback. No account required; validated at the
// boundary and per-IP rate-limited (CDN can't cache a POST, so the token bucket is the
// abuse defense). Stores a salted fingerprint for triage, never the raw IP.

import { ZodError } from "zod";
import { fingerprint } from "@/contributions/fingerprint";
import { createFeedback } from "@/db/queries/feedback";
import { parseFeedbackSubmission } from "@/feedback/schema";
import { clientIp, jsonError, publicLimiter } from "../public/_runtime";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = publicLimiter.check(`feedback:${ip}`);
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
    parsed = parseFeedbackSubmission(body);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_feedback" : "invalid_feedback");
  }

  const fp = fingerprint(ip, req.headers.get("user-agent") ?? "");
  try {
    const result = await createFeedback(parsed, fp);
    return Response.json(result, { status: 201 });
  } catch {
    return jsonError(500, "internal_error");
  }
}
