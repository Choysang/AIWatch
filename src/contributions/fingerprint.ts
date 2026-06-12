// Anonymous contributor fingerprint (decision 14: "anonymous fingerprint"). A salted
// hash of IP + User-Agent — enough to rate-limit and group anonymous submissions without
// storing raw PII. Never trusted as an identity; an account id is used when logged in.

import { createHash } from "node:crypto";

const SALT = process.env.CONTRIBUTION_SALT ?? "aiwatch-contrib";

export function fingerprint(ip: string, userAgent: string, salt: string = SALT): string {
  return createHash("sha256").update(`${salt}:${ip}:${userAgent}`).digest("hex").slice(0, 32);
}
