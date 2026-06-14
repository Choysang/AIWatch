// Resolve the current reader identity for a request (v0.5). Precedence: logged-in account
// > signed `rid` cookie > salted IP+UA fingerprint — the same chain the reactions route
// uses. Topic-board ownership and other per-reader writes key on this. The rid cookie is
// minted by middleware on the SSR reader page (incl. /boards), so a reader reaching the
// board API normally already carries a stable per-device id; the IP+UA fallback only
// covers cookie-blocked clients. Lives under app/_lib because it imports getSession
// (next/headers); the framework-agnostic auth/reader-id stays import-clean.

import { cookies } from "next/headers";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { fingerprint } from "@/contributions/fingerprint";
import type { ReaderIdentity } from "@/db/queries/topic-boards";

/** Parse a single named cookie from a request's Cookie header. Returns the raw value or null. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(/;\s*/)) {
    if (part.startsWith(prefix)) return part.slice(prefix.length);
  }
  return null;
}

/**
 * Resolve the reader identity in the XOR shape the board query layer expects (exactly one
 * of userId / fingerprint non-null). `ip` is passed in so the caller's rate-limit key and
 * this fallback fingerprint agree. Outside a Next request context (tests) getSession throws
 * and we fall back to anonymous, which is correct — identity is never client-claimed.
 */
export async function resolveReaderIdentity(req: Request, ip: string): Promise<ReaderIdentity> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (userId) return { userId, fingerprint: null };

  const ridRaw = readCookie(req, READER_ID_COOKIE);
  const rid = await verifyReaderId(ridRaw);
  const fp = rid ?? fingerprint(ip, req.headers.get("user-agent") ?? "");
  return { userId: null, fingerprint: fp };
}

/**
 * Server-component variant: resolve the reader identity from the request store (cookies()
 * + session) instead of a Request object. Returns null when there is no stable identity —
 * which happens on the very first visit before middleware's rid cookie round-trips (a
 * first-time reader has no boards anyway, so callers render an empty list). No IP+UA
 * fallback here: a server component has no reliable client IP, and the rid cookie is the
 * stable per-device key once present.
 */
export async function resolveReaderIdentityServer(): Promise<ReaderIdentity | null> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (userId) return { userId, fingerprint: null };

  try {
    const store = await cookies();
    const rid = await verifyReaderId(store.get(READER_ID_COOKIE)?.value);
    if (rid) return { userId: null, fingerprint: rid };
  } catch {
    // No request scope (e.g. during static analysis) — fall through to null.
  }
  return null;
}
