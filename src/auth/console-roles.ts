// Console roles allowed into the admin area (decision 10). Pure + import-clean (no
// next/headers), so both the server session helper and client components (the reader
// masthead's "console" link) can share one source of truth. Plain "user" is excluded.

export const ADMIN_ROLES = new Set(["owner", "admin"]);

export const CONSOLE_ROLES = ADMIN_ROLES;

export function isAdminRole(role: string | null | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

export function isConsoleRole(role: string | null | undefined): boolean {
  return isAdminRole(role);
}
