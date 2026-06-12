// better-auth instance (decision 10): DB-backed revocable sessions, httpOnly secure
// cookies. One users table; `role` carries RBAC. Reader login uses email OTP and optional
// Google / WeChat OAuth; existing password accounts remain supported for operator continuity.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { db } from "@/db/client";
import { account, session, user, verification } from "@/db/auth-schema";
import { log } from "@/log";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const wechatClientId = process.env.WECHAT_CLIENT_ID?.trim();
const wechatClientSecret = process.env.WECHAT_CLIENT_SECRET?.trim();

const socialProviders = {
  ...(googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : {}),
  ...(wechatClientId && wechatClientSecret
    ? {
        wechat: {
          clientId: wechatClientId,
          clientSecret: wechatClientSecret,
        },
      }
    : {}),
};

async function sendEmailOtp(data: { email: string; otp: string; type: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  const subject = "AIWatch 登录验证码";
  const text = `你的 AIWatch 登录验证码是 ${data.otp}，5 分钟内有效。`;

  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: data.email,
        subject,
        text,
      }),
    });
    if (!response.ok) throw new Error(`email otp send failed: ${response.status}`);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_EMAIL_FROM and RESEND_API_KEY are required for email OTP in production");
  }

  log.info(`[auth] email otp for ${data.email}: ${data.otp}`);
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  plugins: [
    emailOTP({
      sendVerificationOTP: sendEmailOtp,
      otpLength: 6,
      expiresIn: 300,
    }),
  ],
  user: {
    additionalFields: {
      // RBAC role is server-managed; never settable via the public sign-up input.
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
  // Auth brute-force guard (M2). Per-instance in-memory store (single-instance assumption;
  // a shared Postgres/Redis store is the future multi-instance upgrade). Global default
  // plus tight limits on the credential endpoints.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/email-otp": { window: 60, max: 5 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
});

export type Auth = typeof auth;
