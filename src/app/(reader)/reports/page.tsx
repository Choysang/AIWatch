// Reader "AI 日报" page (/reports). Delegates to the shared day/week/month skeleton so the
// kind switcher (日报/周报/月报) and archive render identically across granularities — this
// page used to be a near-duplicate of KindReportPage with no path to weekly/monthly.

import { messages } from "@/i18n";
import { KindReportPage } from "./kind-report-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.report.heading} · ${messages.appName}`,
  description: messages.report.subheading,
};

export default function ReportsPage() {
  return <KindReportPage kind="daily" archiveBase="/reports" />;
}
