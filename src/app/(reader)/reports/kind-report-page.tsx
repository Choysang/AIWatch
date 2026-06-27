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
import { ReportKindTabs } from "./report-kind-tabs";
import { ReportView } from "./report-view";

const ARCHIVE_TAKE: Record<ReportKind, number> = { daily: 14, weekly: 12, monthly: 12 };

export function kindHeading(kind: ReportKind): string {
  return `AI ${messages.report.kind[kind]}`;
}

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

function ReportArchive({
  kind,
  archiveBase,
  archive,
}: {
  kind: ReportKind;
  archiveBase: string;
  archive: PublicReportListItem[];
}) {
  const m = messages.report;
  if (archive.length <= 1) return null;

  return (
    <nav className="report-archive">
      <h3 className="report-section-title">{`历史${m.kind[kind]}`}</h3>
      <ul>
        {archive.map((r) => (
          <li key={r.date}>
            <Link href={`${archiveBase}/${r.date}`}>{r.date}</Link>：{r.summary}
          </li>
        ))}
      </ul>
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
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{kindHeading(kind)}</h1>
        </div>
        <SubpageNav />
      </header>

      <ReportKindTabs active={kind} />

      {latest ? <ReportView report={latest} /> : <div className="empty">{m.empty}</div>}

      <ReportArchive kind={kind} archiveBase={archiveBase} archive={archive} />
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
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{`${kindHeading(kind)} · ${date}`}</h1>
        </div>
        <SubpageNav />
      </header>

      <ReportKindTabs active={kind} />

      {report ? <ReportView report={report} /> : <div className="empty">{m.notFound}</div>}

      <ReportArchive kind={kind} archiveBase={archiveBase} archive={archive} />
    </main>
  );
}
