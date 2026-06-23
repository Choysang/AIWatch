// 主题简报 (v0.5 B2): a daily/weekly/monthly narrative brief scoped to a topic board's interest
// (tags ∪ sources), assembled query-time by the same deterministic engine the global report uses.
// Driven entirely by the itags/isources URL params (the same a board opens with), so it needs no
// per-identity board lookup and is shareable. No interest = a hint to open from a board.

import Link from "next/link";
import { SubpageNav } from "@/app/subpage-nav";
import { buildBoardBrief } from "@/reports/board-brief";
import { parseInterests } from "@/public/query";
import { messages } from "@/i18n";
import { log } from "@/log";
import type { ReportContent, ReportKind } from "@/reports/types";
import { ReportView } from "../reports/report-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.brief.heading} · ${messages.appName}`,
  description: messages.brief.subheading,
};

type SearchParams = Record<string, string | string[] | undefined>;

const KINDS: ReportKind[] = ["daily", "weekly", "monthly"];

function parseKind(sp: SearchParams): ReportKind {
  const raw = typeof sp.kind === "string" ? sp.kind : Array.isArray(sp.kind) ? sp.kind[0] : undefined;
  return raw === "weekly" || raw === "monthly" ? raw : "daily";
}

/** Carry the interest params (itags/isources) across the kind tabs + the back-to-feed link. */
function interestQuery(sp: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["itags", "isources"]) {
    const v = sp[key];
    const value = typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
    if (value) params.set(key, value);
  }
  return params;
}

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const m = messages.brief;
  const kind = parseKind(sp);
  const interestParams = interestQuery(sp);
  const interest = parseInterests(new URLSearchParams(interestParams));

  if (!interest) {
    return (
      <main className="page">
        <header className="masthead">
          <div>
            <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
          </div>
          <SubpageNav />
        </header>
        <div className="empty">
          {m.noInterest} <Link href="/boards">{m.goBoards} →</Link>
        </div>
      </main>
    );
  }

  let report: ReportContent | null = null;
  try {
    report = await buildBoardBrief({ interest, kind });
  } catch (error) {
    log.warn("[reader] buildBoardBrief failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const feedParams = new URLSearchParams(interestParams);
  feedParams.set("mode", "latest");

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <SubpageNav />
      </header>

      <div className="brief-toolbar">
        <div className="brief-kind-tabs" role="group" aria-label={m.kindLabel}>
          {KINDS.map((k) => {
            const params = new URLSearchParams(interestParams);
            if (k !== "daily") params.set("kind", k);
            return (
              <Link
                key={k}
                href={`/brief?${params.toString()}`}
                className={`brief-kind-tab ${k === kind ? "is-active" : ""}`}
                aria-current={k === kind ? "page" : undefined}
              >
                {messages.report.kind[k]}
              </Link>
            );
          })}
        </div>
        <Link className="brief-back" href={`/?${feedParams.toString()}`}>
          {m.viewFeed} →
        </Link>
      </div>

      {report ? <ReportView report={report} /> : <div className="empty">{m.failed}</div>}
    </main>
  );
}
