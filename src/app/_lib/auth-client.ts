"use client";

// Browser auth client (better-auth). Used by the login form; same-origin by default.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
