import { describe, expect, test } from "bun:test";
import { isPrivateAddress, safeFetch, SafeFetchError, type FetchImpl, type LookupFn } from "./safe-fetch";

describe("isPrivateAddress", () => {
  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.10.20",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  test.each(["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])(
    "allows public %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

const publicLookup: LookupFn = async () => ["93.184.216.34"];
const ok: FetchImpl = async () => new Response("hello", { status: 200 });

describe("safeFetch SSRF guard", () => {
  test("blocks a loopback IP literal without any network call", async () => {
    let called = false;
    const fetchImpl: FetchImpl = async () => {
      called = true;
      return new Response("nope");
    };
    await expect(safeFetch("http://127.0.0.1/feed", { fetchImpl, lookupImpl: publicLookup })).rejects.toBeInstanceOf(
      SafeFetchError,
    );
    expect(called).toBe(false);
  });

  test("blocks a hostname that resolves to a private address", async () => {
    const lookupImpl: LookupFn = async () => ["10.0.0.5"];
    await expect(safeFetch("https://intranet.test/x", { fetchImpl: ok, lookupImpl })).rejects.toBeInstanceOf(
      SafeFetchError,
    );
  });

  test("allows a public host and returns the body", async () => {
    const res = await safeFetch("https://example.com/feed", { fetchImpl: ok, lookupImpl: publicLookup });
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe("hello");
  });

  test("allowHosts bypasses the private-address block", async () => {
    const lookupImpl: LookupFn = async () => ["10.0.0.5"];
    const res = await safeFetch("https://intranet.test/x", {
      fetchImpl: ok,
      lookupImpl,
      allowHosts: ["intranet.test"],
    });
    expect(res.ok).toBe(true);
  });

  test("rejects a non-http(s) protocol", async () => {
    await expect(safeFetch("file:///etc/passwd", { fetchImpl: ok })).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch redirect + size guards", () => {
  test("re-validates redirect hops and blocks a private target", async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    await expect(
      safeFetch("https://example.com", { fetchImpl, lookupImpl: publicLookup }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });

  test("enforces the redirect cap", async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(null, { status: 302, headers: { location: "https://93.184.216.34/next" } });
    await expect(
      safeFetch("https://93.184.216.34/start", { fetchImpl, maxRedirects: 1 }),
    ).rejects.toThrow(/too many redirects/);
  });

  test("enforces the byte cap", async () => {
    const fetchImpl: FetchImpl = async () => new Response("x".repeat(100), { status: 200 });
    await expect(
      safeFetch("https://93.184.216.34/big", { fetchImpl, maxBytes: 10 }),
    ).rejects.toThrow(/byte cap/);
  });
});
