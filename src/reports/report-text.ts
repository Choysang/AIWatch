// Localized report text injected into the pure assembler (buildReport), kept out of the
// assembler so it stays i18n-agnostic. Shared by the global report job (db/jobs/generate-report)
// and the per-board brief (reports/board-brief) so both speak the same voice.

import { messages } from "@/i18n";
import type { ReportKind, ReportText } from "@/reports/types";

export function reportText(kind: ReportKind): ReportText {
  const r = messages.report;
  return {
    title: (ctx) => `${ctx.keywords.join(" / ")} · ${ctx.coverageLabel}`,
    sectionTitles: r.sections,
    summary: (ctx) => {
      if (ctx.itemCount === 0) return r.emptySummary;
      const topic = ctx.keywords.join("、");
      const counts = `${r.counts.focus} ${ctx.focus} · ${r.counts.watching} ${ctx.watching} · ${r.counts.followup} ${ctx.followup}`;
      if (ctx.kind === "weekly") return r.weeklySummary(topic, counts);
      if (ctx.kind === "monthly") return r.monthlySummary(topic, counts);
      return r.dailySummary(topic, counts);
    },
    readingPath: (ctx) => {
      if (ctx.topTitles.length === 0) return [];
      const primary = ctx.topTitles.slice(0, 3).join(" → ");
      if (ctx.kind === "weekly") return [r.weeklyReadingPath(primary), r.weeklyEditorNote(ctx.keywords.join("、"))];
      if (ctx.kind === "monthly") return [r.monthlyReadingPath(primary), r.monthlyEditorNote(ctx.keywords.join("、"))];
      return [r.dailyReadingPath(primary), r.dailyEditorNote(ctx.keywords.join("、"))];
    },
  };
}
