// Presentational daily-report view (spec: Reports). Pure render from a ReportContent;
// no data loading. Each section lists its events as cards answering "what happened?"
// (conclusion) and "why care?" (why).

import { messages } from "@/i18n";
import type { ReportContent, ReportItem } from "@/reports/types";

function ReportItemCard({ item }: { item: ReportItem }) {
  const m = messages.report;
  const level = item.selected_level;
  const label = item.selected_label ?? messages.selectedLabel[level];

  return (
    <article className="card">
      <div className="card-top">
        {item.category && <span className="card-source">{item.category}</span>}
        {level !== "none" && <span className={`badge ${level}`}>{label}</span>}
        {typeof item.quality_score === "number" && (
          <span className="score" style={{ marginLeft: "auto" }} title={messages.card.qualityScore}>
            <span className="num">{item.quality_score}</span>
            <span className="max">/100</span>
          </span>
        )}
      </div>

      <h2>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h2>

      {item.conclusion && <p className="summary">{item.conclusion}</p>}

      {item.why && (
        <p className="reason">
          <span className="label">{m.why}</span>
          {item.why}
        </p>
      )}
    </article>
  );
}

export function ReportView({ report }: { report: ReportContent }) {
  const m = messages.report;

  return (
    <div>
      <p className="section-intro">{report.summary}</p>

      {report.sections.map((section) => (
        <section className="report-section" key={section.key}>
          <h3 className="report-section-title">{section.title}</h3>
          {section.items.length === 0 ? (
            <p className="report-empty-section">{m.emptySection}</p>
          ) : (
            <div className="feed">
              {section.items.map((item) => (
                <ReportItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      ))}

      <p className="note">{messages.card.summaryNote}</p>
    </div>
  );
}
