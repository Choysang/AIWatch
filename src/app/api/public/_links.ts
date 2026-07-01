import type { PublicReport, PublicReportListItem } from "@/db/queries/public-reports";

export function requestOrigin(reqUrl: URL): string {
  return (process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || reqUrl.origin).replace(/\/+$/, "");
}

export function absoluteEventPermalink(origin: string, id: string): string {
  return `${origin}/events/${id}`;
}

export function withReportItemPermalinks(report: PublicReport, origin: string): PublicReport {
  return {
    ...report,
    sections: report.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        permalink: absoluteEventPermalink(origin, item.id),
      })),
    })),
  };
}

export function withDailyArchivePermalinks(
  dailies: PublicReportListItem[],
  origin: string,
): Array<PublicReportListItem & { permalink: string }> {
  return dailies.map((item) => ({
    ...item,
    permalink: `${origin}/daily/${item.date}`,
  }));
}
