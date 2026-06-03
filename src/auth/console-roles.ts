// Console roles allowed into the admin area (decision 10). Pure + import-clean (no
// next/headers), so both the server session helper and client components (the reader
// masthead's "console" link) can share one source of truth. Plain "user" is excluded.

export const CONSOLE_ROLES = new Set([
  "owner",
  "admin",
  "selected_author",
  "moderator",
  "readonly_operator",
]);

export function isConsoleRole(role: string | null | undefined): boolean {
  return Boolean(role && CONSOLE_ROLES.has(role));
}
