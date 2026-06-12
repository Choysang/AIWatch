// Hardened outbound fetch (H2). Wraps fetch with the guards a public-facing crawler /
// scraper needs: a timeout, a response byte cap, a redirect cap that re-validates every
// hop, and an SSRF guard that refuses hosts resolving to loopback / private / link-local /
// reserved ranges (v4 + v6) unless an explicit allow-list is passed.
//
// Used by the source connectors (rss, rsshub) and intended for the downstream leaderboard
// scrapers. Runs only in the Bun worker / Node server runtime (uses node:dns, node:net) —
// never imported by Edge middleware.
//
// SSRF caveat: we resolve the host and block private targets, but a hostile DNS server can
// still rebind between our lookup and fetch's own lookup (classic TOCTOU). The allow-list
// is the strong control for known-good targets; the resolve-and-block step raises the bar
// for everything else.

import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

/** Resolve a hostname to its IP strings. Injectable so tests need no real DNS. */
export type LookupFn = (hostname: string) => Promise<string[]>;
/** The underlying fetch. Injectable so tests need no real network. */
export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  method?: string;
  headers?: Record<string, string>;
  /** Hostnames permitted to resolve to otherwise-blocked addresses (exact, case-insensitive). */
  allowHosts?: string[];
  fetchImpl?: FetchImpl;
  lookupImpl?: LookupFn;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = [m[1], m[2], m[3], m[4]].map((p) => Number(p));
  if (o.some((n) => n > 255)) return null;
  return ((o[0]! << 24) >>> 0) + (o[1]! << 16) + (o[2]! << 8) + o[3]!;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange("0.0.0.0", 8) || // "this" network
    inRange("10.0.0.0", 8) || // private
    inRange("100.64.0.0", 10) || // CGNAT
    inRange("127.0.0.0", 8) || // loopback
    inRange("169.254.0.0", 16) || // link-local
    inRange("172.16.0.0", 12) || // private
    inRange("192.0.0.0", 24) || // IETF protocol assignments
    inRange("192.168.0.0", 16) || // private
    inRange("198.18.0.0", 15) || // benchmarking
    inRange("224.0.0.0", 4) || // multicast
    inRange("240.0.0.0", 4) // reserved
  );
}

/** Expand any IPv6 form (incl. "::" and embedded IPv4) to 16 bytes, or null if invalid. */
function ipv6ToBytes(input: string): Uint8Array | null {
  let ip = input.split("%")[0]!; // drop zone id
  // Fold a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
  const v4m = ip.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4m) {
    const n = ipv4ToInt(v4m[2]!);
    if (n === null) return null;
    const hi = ((n >>> 16) & 0xffff).toString(16);
    const lo = (n & 0xffff).toString(16);
    ip = `${v4m[1]}${hi}:${lo}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = groups[i]!;
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes[i * 2] = (v >> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}

function isPrivateIPv6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true;
  if (b.every((x) => x === 0)) return true; // :: unspecified
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1 loopback
  const mapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  if (mapped) return isPrivateIPv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`); // ::ffff:v4
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 ULA
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  return false;
}

/** True when an IP literal is loopback / private / link-local / reserved. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP → unsafe
}

async function assertHostAllowed(
  hostname: string,
  allowHosts: string[] | undefined,
  lookup: LookupFn,
): Promise<void> {
  if (allowHosts?.some((h) => h.toLowerCase() === hostname.toLowerCase())) return;
  const addresses = isIP(hostname) ? [hostname] : await lookup(hostname);
  if (addresses.length === 0) {
    throw new SafeFetchError(`DNS returned no addresses for ${hostname}`);
  }
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new SafeFetchError(`refusing to fetch ${hostname}: resolves to blocked address ${addr}`);
    }
  }
}

async function bufferWithCap(res: Response, maxBytes: number): Promise<Response> {
  if (!res.body) return res;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new SafeFetchError(`response exceeded byte cap (${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/**
 * Fetch a URL with SSRF, timeout, redirect, and size guards. Returns a real Response whose
 * body is already buffered within the byte cap, so callers use `res.ok` / `res.text()` as
 * with global fetch.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const fetchImpl = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const lookup = opts.lookupImpl ?? defaultLookup;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError(`invalid URL: ${rawUrl}`);
  }

  let redirects = 0;
  for (;;) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new SafeFetchError(`unsupported protocol: ${url.protocol}`);
    }
    await assertHostAllowed(url.hostname, opts.allowHosts, lookup);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: opts.method ?? "GET",
        headers: opts.headers,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (location) {
      if (redirects >= maxRedirects) {
        throw new SafeFetchError(`too many redirects (> ${maxRedirects})`);
      }
      redirects += 1;
      await res.body?.cancel().catch(() => {});
      url = new URL(location, url); // re-validated on next loop iteration
      continue;
    }

    return bufferWithCap(res, maxBytes);
  }
}
