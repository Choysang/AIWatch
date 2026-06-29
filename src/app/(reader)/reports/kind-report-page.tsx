// 点11：日/周/月报共享的读者页骨架。/reports（日）、/reports/weekly、/reports/monthly
// 都渲染“最新一期 + 历史归档”，仅 kind 与归档链接前缀不同。Server component。

import Link from "next/link";
import { unstable_cache } from "next/cache";
import { SubpageNav } from "@/app/subpage-nav";
import {
  getLatestByKind,
  getByKindAndDate,
  listByKind,
  type PublicReport,
  type PublicReportListItem,
} from "@/db/queries/public-reports";
import { messages } from "@/i18n";
import type { ReportKind } from "@/reports/types";
import { kindHeading } from "./report-kind-heading";
import { ReportKindTabs } from "./report-kind-tabs";
import { ReportView } from "./report-view";

const ARCHIVE_TAKE: Record<ReportKind, number> = { daily: 14, weekly: 12, monthly: 12 };
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

async function load(
  kind: ReportKind,
): Promise<{ latest: PublicReport | null; archive: PublicReportListItem[] }> {
  const getCachedLatest = unstable_cache(() => getLatestByKind(kind), [`reader-latest-${kind}`], {
    revalidate: 300,
  });
  const listCached = unstable_cache(
    () => listByKind(kind, ARCHIVE_TAKE[kind]),
    [`reader-archive-${kind}`],
    { revalidate: 300 },
  );
  try {
    const [latest, archive] = await Promise.all([getCachedLatest(), listCached()]);
    return { latest, archive };
  } catch {
    return { latest: null, archive: [] };
  }
}

async function loadArchive(kind: ReportKind): Promise<PublicReportListItem[]> {
  const listCached = unstable_cache(
    () => listByKind(kind, ARCHIVE_TAKE[kind]),
    [`reader-archive-${kind}`],
    { revalidate: 300 },
  );
  try {
    return await listCached();
  } catch {
    return [];
  }
}

async function loadByDate(kind: ReportKind, date: string): Promise<PublicReport | null> {
  const getCachedByDate = unstable_cache(
    () => getByKindAndDate(kind, date),
    [`reader-report-by-date-${kind}-${date}`],
    { revalidate: 300 },
  );
  try {
    return await getCachedByDate();
  } catch {
    return null;
  }
}

function archiveMonth(date: string): string {
  const [year, month] = date.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function archiveDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()] ?? "";
  return `${Number(month)}月${Number(day)}日 · ${weekday}`;
}

function archiveDayLabel(date: string): string {
  return `${Number(date.slice(8, 10))} 日`;
}

function groupArchiveByMonth(archive: PublicReportListItem[]): { month: string; items: PublicReportListItem[] }[] {
  const groups = new Map<string, PublicReportListItem[]>();
  for (const item of archive) {
    const key = archiveMonth(item.date);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([month, items]) => ({ month, items }));
}

function ReportArchive({
  kind,
  archiveBase,
  archive,
  activeDate,
}: {
  kind: ReportKind;
  archiveBase: string;
  archive: PublicReportListItem[];
  activeDate: string | null;
}) {
  const m = messages.report;
  if (archive.length === 0) return null;
  const latest = archive[0];

  return (
    <nav className="report-archive-shell" aria-label={`历史${m.kind[kind]}`}>
      {latest && (
        <Link className="report-archive-latest" href={archiveBase}>
          <strong>{m.latest}</strong>
          <span>{latest.date}</span>
        </Link>
      )}
      <div className="report-archive-title">
        <span>AIWatch {m.kind[kind]} · 历史</span>
        <small>{kind.toUpperCase()} · ARCHIVE</small>
      </div>
      {groupArchiveByMonth(archive).map((group) => (
        <section className="report-archive-month" key={group.month}>
          <h3>
            <span>{group.month}</span>
            <small>{group.items.length}</small>
          </h3>
          <ol>
            {group.items.map((r) => {
              const active = r.date === activeDate;
              return (
                <li key={r.date}>
                  <Link className={active ? "is-active" : ""} href={`${archiveBase}/${r.date}`}>
                    <span className="report-archive-day">{archiveDayLabel(r.date)}</span>
                    <span className="report-archive-copy">
                      <strong>{archiveDateLabel(r.date)}</strong>
                      <span>{r.title}</span>
                      <small>{r.item_count} 事件</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </nav>
  );
}

export async function KindReportPage({
  kind,
  archiveBase,
}: {
  kind: ReportKind;
  archiveBase: string;
}) {
  const { latest, archive } = await load(kind);
  const m = messages.report;

  return (
    <main className="page report-page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{kindHeading(kind)}</h1>
        </div>
        <SubpageNav />
      </header>

      <ReportKindTabs active={kind} />

      <div className="report-page-layout">
        <ReportArchive kind={kind} archiveBase={archiveBase} archive={archive} activeDate={latest?.date ?? null} />
        <div className="report-page-main">
          {latest ? <ReportView report={latest} /> : <div className="empty">{m.empty}</div>}
        </div>
      </div>
    </main>
  );
}

/** Shared date page for one kind ("/reports/weekly/2026-06-08" etc.). */
export async function KindReportByDate({
  kind,
  date,
  archiveBase,
}: {
  kind: ReportKind;
  date: string;
  archiveBase: string;
}) {
  const m = messages.report;
  const [report, archive] = await Promise.all([loadByDate(kind, date), loadArchive(kind)]);

  return (
    <main className="page report-page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{`${kindHeading(kind)} · ${date}`}</h1>
        </div>
        <SubpageNav />
      </header>

      <ReportKindTabs active={kind} />

      <div className="report-page-layout">
        <ReportArchive kind={kind} archiveBase={archiveBase} archive={archive} activeDate={date} />
        <div className="report-page-main">
          {report ? <ReportView report={report} /> : <div className="empty">{m.notFound}</div>}
        </div>
      </div>
    </main>
  );
}
