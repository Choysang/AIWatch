// 读者「AI 月报」页（点11）。
import { messages } from "@/i18n";
import { KindReportPage, kindHeading } from "../kind-report-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${kindHeading("monthly")} · ${messages.appName}`,
  description: messages.report.monthlyBrief,
};

export default function MonthlyReportsPage() {
  return <KindReportPage kind="monthly" archiveBase="/reports/monthly" />;
}
