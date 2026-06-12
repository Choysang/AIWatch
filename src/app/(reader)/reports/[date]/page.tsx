// Reader daily report for an exact date — renders at "/reports/{YYYY-MM-DD}". Calendar
// date is APP_TZ (decision E). Invalid or missing dates show a not-found notice.

import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { SubpageNav } from "@/app/subpage-nav";
import { isCalendarDate } from "@/core/time";
import { getDailyByDate } from "@/db/queries/public-reports";
import { messages } from "@/i18n";
import { ReportView } from "../report-view";

export const dynamic = "force-dynamic";

const getCachedDailyByDate = unstable_cache((date: string) => getDailyByDate(date), [
  "reader-daily-by-date",
], {
  revalidate: 300,
});

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
    report = await getCachedDailyByDate(date);
  } catch {
    report = null;
  }

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{`${m.heading} · ${date}`}</h1>
        </div>
        <SubpageNav />
      </header>

      {report ? <ReportView report={report} /> : <div className="empty">{m.notFound}</div>}
    </main>
  );
}
