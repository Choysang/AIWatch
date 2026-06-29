// 读者「AI 周报」页（点11）— 静态段优先于 /reports/[date]，不会被日期路由吞掉。
import { messages } from "@/i18n";
import { KindReportPage } from "../kind-report-page";
import { kindHeading } from "../report-kind-heading";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${kindHeading("weekly")} · ${messages.appName}`,
  description: messages.report.weeklyBrief,
};

export default function WeeklyReportsPage() {
  return <KindReportPage kind="weekly" archiveBase="/reports/weekly" />;
}
