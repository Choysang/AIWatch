// Reader daily report for an exact date — renders at "/reports/{YYYY-MM-DD}". Calendar
// date is APP_TZ (decision E). Invalid or missing dates show a not-found notice.

import Link from "next/link";
import { notFound } from "next/navigation";
import { isCalendarDate } from "@/core/time";
import { getDailyByDate } from "@/db/queries/public-reports";
import { messages } from "@/i18n";
import { ReportView } from "../report-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<{ title: string }> {
  const { date } = await params;
  const suffix = isCalendarDate(date) ? date : "";
  return { title: `${messages.report.heading}${suffix ? ` ${suffix}` : ""} · ${messages.appName}` };
}

export default async function ReportByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isCalendarDate(date)) notFound();

  const m = messages.report;
  let report = null;
  try {
    report = await getDailyByDate(date);
  } catch {
    report = null;
  }

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{report?.title ?? `${m.heading} · ${date}`}</h1>
        </div>
        <Link href="/reports" className="tagline">
          {m.latest}
        </Link>
      </header>

      {report ? <ReportView report={report} /> : <div className="empty">{m.notFound}</div>}
    </main>
  );
}
