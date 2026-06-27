import { notFound } from "next/navigation";
import { isCalendarDate } from "@/core/time";
import { messages } from "@/i18n";
import { KindReportByDate, kindHeading } from "../kind-report-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<{ title: string }> {
  const { date } = await params;
  const suffix = isCalendarDate(date) ? date : "";
  return { title: `${kindHeading("daily")}${suffix ? ` ${suffix}` : ""} · ${messages.appName}` };
}

export default async function ReportByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isCalendarDate(date)) notFound();
  return <KindReportByDate kind="daily" date={date} archiveBase="/reports" />;
}
