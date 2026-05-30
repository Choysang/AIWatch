// Reader "AI 日报" page — the latest published daily report plus an archive of recent
// dates. (reader) is a route group, so this renders at "/reports". Dynamic: reads the DB
// per request and degrades to a setup hint when the DB isn't reachable or none exist yet.

import Link from "next/link";
import { getLatestDaily, listDailies, type PublicReportListItem } from "@/db/queries/public-reports";
import type { PublicReport } from "@/db/queries/public-reports";
import { messages } from "@/i18n";
import { ReportView } from "./report-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.report.heading} · ${messages.appName}`,
  description: messages.report.subheading,
};

async function load(): Promise<{ latest: PublicReport | null; archive: PublicReportListItem[] }> {
  try {
    const [latest, archive] = await Promise.all([getLatestDaily(), listDailies(14)]);
    return { latest, archive };
  } catch {
    return { latest: null, archive: [] };
  }
}

export default async function ReportsPage() {
  const { latest, archive } = await load();
  const m = messages.report;

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <Link href="/" className="tagline">
          {messages.nav.dynamics}
        </Link>
      </header>

      <p className="section-intro">{m.subheading}</p>

      {latest ? (
        <>
          <h2 className="section-intro" style={{ fontWeight: 600, color: "var(--ink)", margin: "0 0 0.5rem" }}>
            {latest.title}
          </h2>
          <ReportView report={latest} />
        </>
      ) : (
        <div className="empty">{m.empty}</div>
      )}

      {archive.length > 1 && (
        <nav className="report-archive">
          <h3 className="report-section-title">{m.archive}</h3>
          <ul>
            {archive.map((r) => (
              <li key={r.date}>
                <Link href={`/reports/${r.date}`}>{r.date}</Link>：{r.summary}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
