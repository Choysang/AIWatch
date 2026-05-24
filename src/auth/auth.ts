// better-auth instance (decision 10): local email/password, DB-backed revocable
// sessions, httpOnly secure cookies. One users table; `role` carries RBAC. This module
// stays framework-agnostic (no next/react import) so it respects the import boundary.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { account, session, user, verification } from "@/db/auth-schema";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Self-host first run is local; no email provider is required to log in.
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      // RBAC role is server-managed; never settable via the public sign-up input.
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
});

export type Auth = typeof auth;
