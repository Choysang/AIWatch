// Canonical reader "AI 日报" page (/daily). /reports remains as a compatibility
// entry, but shared daily archive links should use this shorter public URL.

import { messages } from "@/i18n";
import { KindReportPage } from "../reports/kind-report-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.report.heading} · ${messages.appName}`,
  description: messages.report.subheading,
};

export default function DailyPage() {
  return <KindReportPage kind="daily" archiveBase="/daily" />;
}
