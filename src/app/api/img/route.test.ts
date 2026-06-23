// Guard tests for the image proxy (v0.5 B1.5). We exercise the request-validation branches that
// short-circuit BEFORE any network fetch — an unsafe/missing `u` must be rejected, so a reader can
// never coerce the proxy into hitting an internal host (SSRF). The happy path (real image fetch) is
// covered by the shared SSRF allowlist tests in src/content/extract.test.ts.

import { describe, expect, test } from "bun:test";
import { GET } from "./route";

function reqFor(u: string | null): Request {
  const url = u === null ? "http://localhost/api/img" : `http://localhost/api/img?u=${encodeURIComponent(u)}`;
  return new Request(url);
}

describe("GET /api/img guard", () => {
  test("rejects a missing url with 400", async () => {
    const res = await GET(reqFor(null));
    expect(res.status).toBe(400);
  });

  test("rejects internal / non-http(s) targets with 400 (no fetch attempted)", async () => {
    for (const u of [
      "http://127.0.0.1/secret.png",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost/x.png",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ]) {
      const res = await GET(reqFor(u));
      expect(res.status, u).toBe(400);
    }
  });
});
