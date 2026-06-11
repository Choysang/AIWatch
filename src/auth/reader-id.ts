// Reader-identity cookie (Slice 8). Persistent anonymous identity for non-logged-in
// readers so reactions group by *device/cookie*, not per-IP+UA fingerprint.
//
// Threat model: this is NOT trusted as a user identity. It only groups reactions by
// the same browser. Anyone can clear cookies to get a fresh id; that's fine — we still
// rate-limit by IP. The HMAC just keeps clients from forging arbitrary ids in our
// reaction tables and makes log/db scanning unambiguous (every rid in storage was
// minted by this server).
//
// Implementation note: uses the Web Crypto API (globalThis.crypto.subtle) so the same
// module works in Node's runtime AND in the Edge runtime where the cookie-minting
// middleware runs. node:crypto would crash the Edge bundle.

const COOKIE_NAME = "rid";
const SECRET_ENV = "READER_ID_SECRET";
const FALLBACK_SECRET_ENV = "BETTER_AUTH_SECRET";
// 400 days is the iOS/Safari upper bound for Set-Cookie max-age. Long enough that a
// reader's reactions persist across sessions; short enough that abandoned cookies age out.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const ID_BYTES = 16;

export const READER_ID_COOKIE = COOKIE_NAME;
export const READER_ID_MAX_AGE_SECONDS = MAX_AGE_SECONDS;

function getSecret(): string {
  const secret = process.env[SECRET_ENV] ?? "";
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${SECRET_ENV} must be set in production`);
  }
  return process.env[FALLBACK_SECRET_ENV] ?? "aiwatch-reader-id-dev";
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
    const base = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const bin = atob(base);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// Cache imported HMAC keys per secret string. Web Crypto keys are non-extractable
// CryptoKey objects; building one on every call is wasteful when the secret is fixed.
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let cached = keyCache.get(secret);
  if (cached) return cached;
  const enc = new TextEncoder().encode(secret);
  cached = crypto.subtle.importKey(
    "raw",
    enc,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  keyCache.set(secret, cached);
  return cached;
}

async function sign(idBytes: Uint8Array, secret: string): Promise<string> {
  const key = await importKey(secret);
  // Pass an explicit ArrayBuffer view rather than the Uint8Array directly: TS's
  // BufferSource type rejects Uint8Array<ArrayBufferLike> because the buffer could
  // theoretically be a SharedArrayBuffer in some lib targets. .slice() always returns
  // a fresh ArrayBuffer-backed view.
  const view = idBytes.slice().buffer as ArrayBuffer;
  const sig = await crypto.subtle.sign("HMAC", key, view);
  return b64url(new Uint8Array(sig));
}

/** Mint a fresh signed reader-id token. */
export async function mintReaderId(secret: string = getSecret()): Promise<string> {
  const idBytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(idBytes);
  const sig = await sign(idBytes, secret);
  return `${b64url(idBytes)}.${sig}`;
}

/**
 * Verify a reader-id token and return its payload (the 16-byte id, b64url-encoded)
 * when valid, otherwise null. Constant-time signature compare.
 */
export async function verifyReaderId(
  token: string | undefined | null,
  secret: string = getSecret(),
): Promise<string | null> {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const idBytes = b64urlDecode(payload);
  if (!idBytes || idBytes.length !== ID_BYTES) return null;
  const expected = await sign(idBytes, secret);
  if (sig.length !== expected.length) return null;
  // Constant-time compare on equal-length strings.
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? payload : null;
}

/**
 * Convenience: derive the anonymous identity from a maybe-present rid cookie value.
 * Returns the verified payload (same field stored in `event_reactions.fingerprint`)
 * or null when missing/invalid.
 */
export async function readerIdFromCookie(
  token: string | undefined | null,
): Promise<string | null> {
  return verifyReaderId(token);
}

/** Build a Set-Cookie value for a freshly minted (or existing) rid. */
export function readerIdSetCookie(token: string): string {
  // HttpOnly: client JS never reads it (prevents trivial XSS theft); the browser sends
  // it back automatically on /api/events/*/reactions.
  // SameSite=Lax: blocked on cross-site iframe POSTs but not on top-level nav.
  // Secure: only in production (dev runs on http://localhost).
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}
