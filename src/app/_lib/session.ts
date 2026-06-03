// Server-side session access for app code. Lives under app/ (not src/auth) because it
// imports next/headers; the framework-agnostic auth instance stays import-clean.

import { headers } from "next/headers";
import { auth } from "@/auth/auth";

// Re-exported from the import-clean module so client components can share the same set.
export { isConsoleRole } from "@/auth/console-roles";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
