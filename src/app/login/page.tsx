// Login / register page (SP3.2). Server component: it reads and sanitises the post-auth
// redirect target (`next`) and hands a safe value to the client form. Readers land back on
// the page they came from; admins reach the console via `?next=/_admin` (set by the admin
// guard), so neither flow is hard-coded to the other's destination.

import { LoginForm } from "./login-form";

// Only allow same-origin absolute paths. Reject protocol-relative ("//evil.com") and any
// absolute URL so `next` can never become an open redirect.
function safeNext(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  return (
    <main className="page">
      <LoginForm next={next} />
    </main>
  );
}
