// Server-side session access for app code. Lives under app/ (not src/auth) because it
// imports next/headers; the framework-agnostic auth instance stays import-clean.

import { headers } from "next/headers";
import { auth } from "@/auth/auth";

// Console roles allowed to view the admin area (decision 10). Plain "user" is excluded.
const CONSOLE_ROLES = new Set([
  "owner",
  "admin",
  "selected_author",
  "moderator",
  "readonly_operator",
]);

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export function isConsoleRole(role: string | null | undefined): boolean {
  return Boolean(role && CONSOLE_ROLES.has(role));
}
