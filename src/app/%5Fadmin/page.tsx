// Admin console — source health (Slice 0 scope). The folder is `%5Fadmin` so the App
// Router serves it at the literal URL `/_admin` (a plain `_admin` folder would be a
// private, non-routable folder). Unlinked from public nav (decision B); requires login
// + a console role (decision 10).

import { redirect } from "next/navigation";
import { formatDateTime } from "@/app/_lib/format";
import { getSession, isConsoleRole } from "@/app/_lib/session";
import { listSourceHealth, type SourceHealthRow } from "@/db/queries/sources";
import { messages } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string }).role;
  if (!isConsoleRole(role)) {
    return (
      <main className="page">
        <p>{messages.admin.loginRequired}</p>
      </main>
    );
  }

  const rows = await listSourceHealth();
  const c = messages.admin.columns;

  return (
    <main className="page">
      <header className="masthead">
        <h1 style={{ fontSize: "1.8rem" }}>{messages.admin.title}</h1>
        <span className="tagline">{messages.admin.sourceHealth}</span>
      </header>

      {rows.length === 0 ? (
        <div className="empty">{messages.admin.empty}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{c.name}</th>
              <th>{c.platform}</th>
              <th>{c.level}</th>
              <th>{c.connector}</th>
              <th>{c.enabled}</th>
              <th>{c.health}</th>
              <th>{c.lastFetch}</th>
              <th>{c.nextFetch}</th>
              <th>{c.failures}</th>
              <th>{c.lastError}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: SourceHealthRow) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.platform}</td>
                <td>{row.level}</td>
                <td>{row.connectorType}</td>
                <td>{row.enabled ? "✓" : "—"}</td>
                <td>
                  <span className={`pill ${row.healthStatus}`}>{row.healthStatus}</span>
                </td>
                <td>{formatDateTime(row.lastFetchAt)}</td>
                <td>{formatDateTime(row.nextFetchAt)}</td>
                <td>{row.failureCount}</td>
                <td style={{ color: "var(--ink-faint)", maxWidth: 240 }}>{row.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
