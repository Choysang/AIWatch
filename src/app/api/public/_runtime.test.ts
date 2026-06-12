import { afterEach, describe, expect, test } from "bun:test";
import { clientIp } from "./_runtime";

let savedTrustedProxyHops: string | undefined;

function req(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/public/items", { headers });
}

describe("clientIp", () => {
  afterEach(() => {
    if (savedTrustedProxyHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = savedTrustedProxyHops;
  });

  test("does not trust X-Forwarded-For when TRUSTED_PROXY_HOPS=0", () => {
    savedTrustedProxyHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "0";

    expect(clientIp(req({
      "x-forwarded-for": "203.0.113.200",
      "x-real-ip": "198.51.100.9",
    }))).toBe("198.51.100.9");
  });

  test("returns unknown for an untrusted X-Forwarded-For chain without a direct IP header", () => {
    savedTrustedProxyHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "0";

    expect(clientIp(req({ "x-forwarded-for": "203.0.113.200" }))).toBe("unknown");
  });

  test("uses the rightmost X-Forwarded-For value when one trusted proxy appends the client IP", () => {
    savedTrustedProxyHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "1";

    expect(clientIp(req({
      "x-forwarded-for": "198.51.100.200, 203.0.113.9",
    }))).toBe("203.0.113.9");
  });

  test("walks past trusted proxy entries from the right", () => {
    savedTrustedProxyHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "2";

    expect(clientIp(req({
      "x-forwarded-for": "198.51.100.200, 203.0.113.9, 192.0.2.10",
    }))).toBe("203.0.113.9");
  });
});
