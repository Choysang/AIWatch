import { afterEach, describe, expect, test } from "bun:test";
import { sendEmail } from "./email";

const realFetch = globalThis.fetch;
const KEYS = ["RESEND_API_KEY", "AUTH_EMAIL_FROM"] as const;
const saved: Record<string, string | undefined> = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sendEmail", () => {
  test("skips with no_recipient when `to` is blank", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.AUTH_EMAIL_FROM = "from@test";
    const result = await sendEmail({ to: "  ", subject: "s", text: "t" });
    expect(result).toEqual({ sent: false, skippedReason: "no_recipient" });
  });

  test("skips with not_configured when the API key/from are missing", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_EMAIL_FROM;
    const result = await sendEmail({ to: "a@b.test", subject: "s", text: "t" });
    expect(result).toEqual({ sent: false, skippedReason: "not_configured" });
  });

  test("posts to Resend and reports sent on a 200, keeping the key in the header only", async () => {
    process.env.RESEND_API_KEY = "re_secret";
    process.env.AUTH_EMAIL_FROM = "from@test";
    let seen: { url?: string; auth?: string; body?: string } = {};
    globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
      seen = { url, auth: init?.headers?.authorization, body: init?.body };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendEmail({ to: "a@b.test", subject: "hi", text: "body" });
    expect(result).toEqual({ sent: true });
    expect(seen.url).toContain("resend.com");
    expect(seen.auth).toBe("Bearer re_secret");
    expect(seen.body).not.toContain("re_secret"); // key never travels in the body
    expect(JSON.parse(seen.body ?? "{}").to).toBe("a@b.test");
  });

  test("throws when Resend rejects a fully-configured send", async () => {
    process.env.RESEND_API_KEY = "re_secret";
    process.env.AUTH_EMAIL_FROM = "from@test";
    globalThis.fetch = (async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;
    await expect(sendEmail({ to: "a@b.test", subject: "s", text: "t" })).rejects.toThrow("email send failed: 422");
  });
});
