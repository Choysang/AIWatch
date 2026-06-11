// Unit tests for the reader-id cookie helper (Slice 8). The cookie is the anonymous
// reader's stable identity for reactions; signing prevents clients from inserting
// forged ids into our reaction tables. Web Crypto API everywhere → async.

import { describe, expect, test } from "bun:test";
import {
  READER_ID_COOKIE,
  mintReaderId,
  readerIdSetCookie,
  verifyReaderId,
} from "./reader-id";

const SECRET = "test-reader-secret-do-not-use-in-prod";

async function withEnv<T>(
  patch: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    const value = patch[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("reader-id cookie", () => {
  test("mint produces a verifiable token", async () => {
    const token = await mintReaderId(SECRET);
    expect(token).toContain(".");
    const payload = await verifyReaderId(token, SECRET);
    expect(payload).not.toBeNull();
    expect(typeof payload).toBe("string");
    expect(payload!.length).toBeGreaterThan(10);
  });

  test("two mints produce different ids", async () => {
    const a = await mintReaderId(SECRET);
    const b = await mintReaderId(SECRET);
    expect(a).not.toBe(b);
  });

  test("rejects tampered payload", async () => {
    const token = await mintReaderId(SECRET);
    const [, sig] = token.split(".");
    // Flip leading bytes in the payload while keeping the original signature.
    const tampered = `AAAA${token.slice(4, token.indexOf("."))}.${sig}`;
    expect(await verifyReaderId(tampered, SECRET)).toBeNull();
  });

  test("rejects tampered signature", async () => {
    const token = await mintReaderId(SECRET);
    const [payload] = token.split(".");
    // Replace the signature with something the same length.
    const fakeSig = "A".repeat(token.length - payload!.length - 1);
    expect(await verifyReaderId(`${payload}.${fakeSig}`, SECRET)).toBeNull();
  });

  test("rejects token signed with a different secret", async () => {
    const token = await mintReaderId(SECRET);
    expect(await verifyReaderId(token, "different-secret")).toBeNull();
  });

  test("rejects malformed input", async () => {
    expect(await verifyReaderId("", SECRET)).toBeNull();
    expect(await verifyReaderId(undefined, SECRET)).toBeNull();
    expect(await verifyReaderId(null, SECRET)).toBeNull();
    expect(await verifyReaderId("no-dot-here", SECRET)).toBeNull();
    expect(await verifyReaderId(".only-sig", SECRET)).toBeNull();
    expect(await verifyReaderId("only-payload.", SECRET)).toBeNull();
  });

  test("Set-Cookie has expected attributes", async () => {
    const token = await mintReaderId(SECRET);
    const header = readerIdSetCookie(token);
    expect(header).toContain(`${READER_ID_COOKIE}=${token}`);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=");
  });

  test("production default secret refuses to fall back to BETTER_AUTH_SECRET", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        READER_ID_SECRET: undefined,
        BETTER_AUTH_SECRET: "x".repeat(32),
      },
      async () => {
        await expect(mintReaderId()).rejects.toThrow("READER_ID_SECRET");
      },
    );
  });
});
