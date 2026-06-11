"use client";

// Browser auth client (better-auth). Used by the login form; same-origin by default.
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
