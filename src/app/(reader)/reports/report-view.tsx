// Presentational daily-report view (spec: Reports). Pure render from a ReportContent;
// no data loading. Each section lists its events as cards answering "what happened?"
// (conclusion) and "why care?" (why).

import { messages } from "@/i18n";
import type { ReportContent, ReportItem, ReportKind, SectionKey } from "@/reports/types";

type EventCategoryKey = keyof typeof messages.search.eventCategory;

function categoryLabel(category: string | null): string | null {
  if (!category || !(category in messages.search.eventCategory)) return null;
  return messages.search.eventCategory[category as EventCategoryKey];
}

function briefLabel(kind: ReportKind): string {
  const m = messages.report;
  if (kind === "weekly") return m.weeklyBrief;
  if (kind === "monthly") return m.monthlyBrief;
  return m.publicBrief;
}

function itemKicker(sectionKey: SectionKey, index: number): string {
  const n = index + 1;
  if (sectionKey === "today_focus") return `精讲 ${n}`;
  if (sectionKey === "worth_watching") return `精选 ${n}`;
  return `速览 ${n}`;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function paragraphs(text: string): string[] {
  const result: string[] = [];
  for (const part of text.split(/\n{2,}/)) {
    const paragraph = part.trim();
    if (paragraph) result.push(paragraph);
  }
  return result;
}

function ReportItemCard({
  item,
  sectionKey,
  index,
}: {
  item: ReportItem;
  sectionKey: SectionKey;
  index: number;
}) {
  const m = messages.report;
  const level = item.selected_level;
  const label = item.selected_label ?? messages.selectedLabel[level];
  const category = categoryLabel(item.category);
  const tags = unique([category ?? "", ...(item.tags ?? [])]);
  const source = unique([item.source_name ?? "", item.source_handle ?? ""]).join(" ");

  return (
    <article className="card report-card">
      <div className="report-item-kicker">{itemKicker(sectionKey, index)}</div>
      <div className="card-top">
        {category && <span className="card-source">{category}</span>}
        {source && (
          <>
            <span className="sep" />
            <span title={m.source}>{source}</span>
          </>
        )}
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

      {item.conclusion && (
        <p className="summary">
          <span className="report-field-label">{m.bodySummary}</span>
          {item.conclusion}
        </p>
      )}

      {item.why && (
        <p className="reason">
          <span className="label">{m.coreViewpoints}</span>
          {item.why}
        </p>
      )}

      {tags.length > 0 && (
        <div className="report-tags" aria-label={m.tags}>
          {tags.slice(0, 6).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export function ReportView({ report }: { report: ReportContent }) {
  const m = messages.report;

  return (
    <div className="report-view">
      <section className="report-hero" aria-labelledby="report-title">
        <div className="report-hero-kicker">
          <span>{briefLabel(report.kind)}</span>
          {report.coverage_label && <span>{report.coverage_label}</span>}
        </div>
        <h2 id="report-title">{report.title}</h2>
        <div className="report-intro">
          <strong>{m.intro}</strong>
          {paragraphs(report.summary).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {report.keywords && report.keywords.length > 0 && (
          <div className="report-keywords" aria-label={m.tags}>
            {report.keywords.map((keyword) => (
              <span className="tag" key={keyword}>
                {keyword}
              </span>
            ))}
          </div>
        )}
      </section>

      {report.sections.map((section) => (
        <section className="report-section" key={section.key}>
          <h3 className="report-section-title">{section.title}</h3>
          {section.items.length === 0 ? (
            <p className="report-empty-section">{m.emptySection}</p>
          ) : (
            <div className="feed">
              {section.items.map((item, index) => (
                <ReportItemCard key={item.id} item={item} sectionKey={section.key} index={index} />
              ))}
            </div>
          )}
        </section>
      ))}

      {report.reading_path && report.reading_path.length > 0 && (
        <section className="report-section report-reading-path">
          <h3 className="report-section-title">{m.readingPath}</h3>
          <div className="report-reading-list">
            {report.reading_path.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </section>
      )}

      <p className="note">{messages.card.summaryNote}</p>
    </div>
  );
}
