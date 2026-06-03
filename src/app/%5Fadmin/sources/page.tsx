import { redirect } from "next/navigation";
import { getSession, isConsoleRole } from "@/app/_lib/session";
import { messages } from "@/i18n";

export const metadata = {
  title: `信源管理 · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/_admin");

  const role = (session.user as { role?: string }).role;
  if (!isConsoleRole(role)) {
    return (
      <main className="page">
        <p>{messages.admin.loginRequired}</p>
      </main>
    );
  }

  redirect("/_admin");
}
