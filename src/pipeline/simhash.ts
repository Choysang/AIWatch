import { createHash } from "node:crypto";

const BITS = 64;
const TOKEN_RE = /[a-z0-9_+-]+|[\u4e00-\u9fa5]{1,2}/giu;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).slice(0, 256);
}

function hash64(token: string): bigint {
  const hex = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return BigInt(`0x${hex}`);
}

export function simhash(text: string): string {
  const weights = Array.from({ length: BITS }, () => 0);
  const ts = tokens(text);
  for (const token of ts.length ? ts : [text]) {
    const h = hash64(token);
    for (let i = 0; i < BITS; i++) {
      const bit = (h >> BigInt(i)) & 1n;
      weights[i] = (weights[i] ?? 0) + (bit === 1n ? 1 : -1);
    }
  }

  let out = 0n;
  for (let i = 0; i < BITS; i++) {
    if ((weights[i] ?? 0) > 0) out |= 1n << BigInt(i);
  }
  return out.toString(16).padStart(16, "0");
}

export function hammingDistanceHex(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  let x: bigint;
  let y: bigint;
  try {
    x = BigInt(`0x${a}`);
    y = BigInt(`0x${b}`);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  let diff = x ^ y;
  let distance = 0;
  while (diff) {
    distance++;
    diff &= diff - 1n;
  }
  return distance;
}
