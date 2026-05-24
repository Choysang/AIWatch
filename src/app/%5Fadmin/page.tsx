// Admin console — source health (Slice 0 scope). The folder is `%5Fadmin` so the App
// Router serves it at the literal URL `/_admin` (a plain `_admin` folder would be a
// private, non-routable folder). Unlinked from public nav (decision B); requires login
// + a console role (decision 10).

import { redirect } from "next/navigation";
import { formatDateTime } from "@/app/_lib/format";
import { getSession, isConsoleRole } from "@/app/_lib/session";
import { listPromotedEvents, type PromotedEventRow } from "@/db/queries/promotions";
import { listRecentReports, type AdminReportRow } from "@/db/queries/public-reports";
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

  const [rows, promoted, reports] = await Promise.all([
    listSourceHealth(),
    listPromotedEvents(),
    listRecentReports(),
  ]);
  const c = messages.admin.columns;
  const pc = messages.admin.promotionColumns;
  const rc = messages.admin.reportColumns;

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

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>
        {messages.admin.promotions}
      </h2>
      {promoted.length === 0 ? (
        <div className="empty">{messages.admin.noPromotions}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{pc.title}</th>
              <th>{pc.level}</th>
              <th>{pc.score}</th>
              <th>{pc.threshold}</th>
              <th>{pc.window}</th>
              <th>{pc.rank}</th>
              <th>{pc.promotedAt}</th>
            </tr>
          </thead>
          <tbody>
            {promoted.map((ev: PromotedEventRow) => (
              <tr key={ev.id}>
                <td style={{ maxWidth: 320 }}>{ev.title}</td>
                <td>
                  <span className={`badge ${ev.selectedLevel}`}>
                    {ev.selectedLabel ?? ev.selectedLevel}
                  </span>
                </td>
                <td>{ev.breakdown ? ev.breakdown.promotionScore.toFixed(1) : "—"}</td>
                <td>{ev.breakdown?.threshold ?? "—"}</td>
                <td>{ev.breakdown?.windowDays ?? "—"}</td>
                <td>
                  {ev.breakdown
                    ? `${ev.breakdown.rankInWindow} / ${ev.breakdown.slotLimit}`
                    : "—"}
                </td>
                <td>{formatDateTime(ev.promotedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>
        {messages.admin.reports}
      </h2>
      {reports.length === 0 ? (
        <div className="empty">{messages.admin.noReports}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{rc.kind}</th>
              <th>{rc.date}</th>
              <th>{rc.status}</th>
              <th>{rc.summary}</th>
              <th>{rc.generatedAt}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r: AdminReportRow) => (
              <tr key={`${r.kind}-${r.date}`}>
                <td>{messages.report.kind[r.kind]}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                <td>
                  <span className={`pill ${r.status === "published" ? "healthy" : "degraded"}`}>
                    {messages.admin.reportStatus[r.status]}
                  </span>
                </td>
                <td style={{ color: "var(--ink-faint)", maxWidth: 280 }}>{r.summary ?? ""}</td>
                <td>{formatDateTime(r.generatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
