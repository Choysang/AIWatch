import { messages } from "@/i18n";
import type { ReportKind } from "@/reports/types";

export function kindHeading(kind: ReportKind): string {
  return `AI ${messages.report.kind[kind]}`;
}
