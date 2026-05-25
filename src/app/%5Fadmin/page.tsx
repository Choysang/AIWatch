// Admin console — source health (Slice 0 scope). The folder is `%5Fadmin` so the App
// Router serves it at the literal URL `/_admin` (a plain `_admin` folder would be a
// private, non-routable folder). Unlinked from public nav (decision B); requires login
// + a console role (decision 10).

import { redirect } from "next/navigation";
import { formatDateTime } from "@/app/_lib/format";
import { getSession, isConsoleRole } from "@/app/_lib/session";
import { listAuditLogs, type AuditRow } from "@/db/queries/audit";
import { listContributions, type ContributionRow } from "@/db/queries/contributions";
import { listPromotedEvents, type PromotedEventRow } from "@/db/queries/promotions";
import { listRecentReports, type AdminReportRow } from "@/db/queries/public-reports";
import { listSourceHealth, type SourceHealthRow } from "@/db/queries/sources";
import { messages } from "@/i18n";
import type { ContributionStatus } from "@/contributions/types";
import type { ReviewAction } from "@/contributions/review";

// Actions offered per status, matching the review state machine (src/contributions/review.ts).
// `apply` is only meaningful for source recommendations (the only auto-appliable kind in V1).
const ACTIONS_BY_STATUS: Record<ContributionStatus, ReviewAction[]> = {
  submitted: ["triage", "approve", "reject"],
  triaged: ["approve", "reject"],
  approved: ["apply", "reject"],
  rejected: [],
  applied: [],
};

function availableActions(row: ContributionRow): ReviewAction[] {
  const actions = ACTIONS_BY_STATUS[row.status];
  return actions.filter((a) => (a === "apply" ? row.kind === "source_recommendation" : true));
}

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

  const [rows, promoted, reports, contributions, audit] = await Promise.all([
    listSourceHealth(),
    listPromotedEvents(),
    listRecentReports(),
    listContributions(),
    listAuditLogs(),
  ]);
  const c = messages.admin.columns;
  const pc = messages.admin.promotionColumns;
  const rc = messages.admin.reportColumns;
  const cc = messages.admin.contributionColumns;
  const ac = messages.admin.auditColumns;

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

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>
        {messages.admin.contributions}
      </h2>
      {contributions.length === 0 ? (
        <div className="empty">{messages.admin.noContributions}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{cc.kind}</th>
              <th>{cc.target}</th>
              <th>{cc.status}</th>
              <th>{cc.reason}</th>
              <th>{cc.contributor}</th>
              <th>{cc.createdAt}</th>
              <th>{cc.actions}</th>
            </tr>
          </thead>
          <tbody>
            {contributions.map((row: ContributionRow) => (
              <tr key={row.id}>
                <td>{messages.admin.contributionKind[row.kind]}</td>
                <td style={{ color: "var(--ink-faint)" }}>
                  {row.targetType}
                  {row.targetId ? ` · ${row.targetId}` : ""}
                </td>
                <td>
                  <span className={`pill ${row.status === "applied" ? "healthy" : "degraded"}`}>
                    {messages.admin.contributionStatus[row.status]}
                  </span>
                </td>
                <td style={{ color: "var(--ink-faint)", maxWidth: 280 }}>{row.reason ?? ""}</td>
                <td style={{ color: "var(--ink-faint)" }}>
                  {row.contributorUserId ??
                    (row.contributorFingerprint
                      ? `${messages.admin.contributionAnon} · ${row.contributorFingerprint.slice(0, 8)}`
                      : messages.admin.contributionAnon)}
                </td>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {availableActions(row).map((action) => (
                      <form key={action} method="post" action={`/api/_admin/contributions/${row.id}`}>
                        <input type="hidden" name="action" value={action} />
                        <button type="submit" className="admin-action">
                          {messages.admin.contributionActions[action]}
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>{messages.admin.audit}</h2>
      {audit.length === 0 ? (
        <div className="empty">{messages.admin.noAudit}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{ac.action}</th>
              <th>{ac.actor}</th>
              <th>{ac.target}</th>
              <th>{ac.reason}</th>
              <th>{ac.createdAt}</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((row: AuditRow) => (
              <tr key={row.id}>
                <td>{row.action}</td>
                <td style={{ color: "var(--ink-faint)" }}>
                  {row.actorId ?? messages.admin.auditSystemActor}
                </td>
                <td style={{ color: "var(--ink-faint)" }}>
                  {row.targetType ? `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ""}` : ""}
                </td>
                <td style={{ color: "var(--ink-faint)", maxWidth: 280 }}>{row.reason ?? ""}</td>
                <td>{formatDateTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
