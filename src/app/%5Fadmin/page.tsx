// Admin console. The folder is `%5Fadmin` so the App
// Router serves it at the literal URL `/_admin` (a plain `_admin` folder would be a
// private, non-routable folder). Unlinked from public nav (decision B); requires login
// + a console role (decision 10).

import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/app/_lib/format";
import { getSession, isAdminRole } from "@/app/_lib/session";
import { can } from "@/auth/rbac";
import { loadOwnerAffinityProfile } from "@/db/jobs/recompute-rank-scores";
import { getOwnerAnnotations } from "@/db/queries/owner-annotations";
import { sourceAffinitySuggestion } from "@/scoring/owner-affinity";
import { loadAdminDashboard, type AdminDashboardData, type DailyOpsRow } from "@/db/queries/admin-dashboard";
import { listContributions, type ContributionRow } from "@/db/queries/contributions";
import { listFeedback, type FeedbackRow } from "@/db/queries/feedback";
import { listPromotedEvents, type PromotedEventRow } from "@/db/queries/promotions";
import { listRecentReports, type AdminReportRow } from "@/db/queries/public-reports";
import { listManagedSources } from "@/db/queries/sources";
import { messages } from "@/i18n";
import { DEFAULT_SOURCE_PROFILE } from "@/sources/source-form";
import { inferAiSourceCategory } from "@/sources/ai-source-categories";
import { checkManagedSourcesFetchHealth } from "@/sources/source-health-check";
import { SourceManagementSection, type SourceAnnotationCell } from "./sources/source-management";
import type { SourceRecommendationReviewItem } from "./sources/source-review-dialog";

// Admin console: titled for the operator, but never indexed (unlinked from public nav).
export const metadata = {
  title: `管理后台 · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";


function pct(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

function barStyle(value: number, max: number): CSSProperties {
  return { "--bar-width": pct(value, max) } as CSSProperties;
}

function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const maxDaily = Math.max(1, ...data.daily.map((row: DailyOpsRow) => Math.max(row.posts, row.events, row.views)));

  return (
    <section className="admin-dashboard" aria-label="运营看板">
      <div className="admin-section-head">
        <div>
          <h2>运营看板</h2>
          <p>先看抓取、判定、信源、成本和阅读行为，再决定今天要修哪条链路。</p>
        </div>
        <Link href="/_admin/routing">模型路由</Link>
      </div>

      <div className="admin-metric-grid">
        {data.metrics.map((metric) => (
          <article key={metric.label} className={`admin-metric-card is-${metric.tone}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.hint}</p>
          </article>
        ))}
      </div>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-panel-wide">
          <h3>最近 7 日更新链路</h3>
          <div className="admin-daily-bars">
            {data.daily.map((row) => (
              <div key={row.day} className="admin-daily-row">
                <span className="admin-daily-day">{row.day.slice(5)}</span>
                <div className="admin-bar-stack">
                  <span className="admin-bar posts" style={barStyle(row.posts, maxDaily)}>帖 {row.posts}</span>
                  <span className="admin-bar events" style={barStyle(row.events, maxDaily)}>事 {row.events}</span>
                  <span className="admin-bar views" style={barStyle(row.views, maxDaily)}>读 {row.views}</span>
                  {row.providerErrors > 0 && <span className="admin-provider-error">LLM {row.providerErrors}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <h3>信源健康</h3>
          <ul className="admin-compact-list">
            {data.sourceHealth.map((row) => (
              <li key={`${row.platform}-${row.healthStatus}`}>
                <span>{row.platform} · {row.healthStatus}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-panel">
          <h3>LLM 成本 Top</h3>
          <ul className="admin-compact-list">
            {data.llmSpend.length === 0 ? <li><span>暂无真实调用记账</span><strong>0</strong></li> : data.llmSpend.map((row) => (
              <li key={`${row.task}-${row.provider}-${row.modelId}`}>
                <span>{row.task}<small>{row.provider} · {row.modelId}</small></span>
                <strong>${row.costUsd.toFixed(4)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-panel-wide">
          <h3>7 日信源产出 Top</h3>
          <table className="admin-mini-table">
            <thead><tr><th>信源</th><th>状态</th><th>帖子</th><th>事件</th><th>精选</th><th>失败</th></tr></thead>
            <tbody>
              {data.sourceOutput.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}<small>{row.platform}</small></td>
                  <td>{row.healthStatus}</td>
                  <td>{row.posts}</td>
                  <td>{row.events}</td>
                  <td>{row.selected}</td>
                  <td className={row.failed > 0 ? "is-danger" : undefined}>{row.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="admin-panel">
          <h3>资讯点击 Top</h3>
          <ul className="admin-event-list">
            {data.topEvents.map((row) => (
              <li key={row.id}>
                <Link href={`/events/${row.id}`}>{row.title}</Link>
                <span>{row.sourceName ?? "未知信源"} · {row.viewCount} 次阅读 · {row.likeCount + row.starCount} 互动</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function selectedScore(ev: PromotedEventRow): number | null {
  return ev.breakdown?.selectionScore ?? ev.breakdown?.promotionScore ?? null;
}

function sourceReviewItem(row: ContributionRow): SourceRecommendationReviewItem | null {
  if (row.kind !== "source_recommendation") return null;
  if (row.status === "rejected" || row.status === "applied") return null;
  const change = row.proposedChange && typeof row.proposedChange === "object"
    ? (row.proposedChange as Record<string, unknown>)
    : {};
  const url = typeof change.url === "string" ? change.url : "";
  if (!url) return null;
  const categories = Array.isArray(change.categories)
    ? change.categories.filter((v): v is string => typeof v === "string")
    : [];

  return {
    id: row.id,
    name: typeof change.name === "string" ? change.name : url,
    platform: typeof change.platform === "string" ? change.platform : "x",
    sourceProfile:
      typeof change.sourceProfile === "string"
        ? inferAiSourceCategory({ sourceProfile: change.sourceProfile })
        : DEFAULT_SOURCE_PROFILE,
    handle: typeof change.handle === "string" ? change.handle : "",
    url,
    recommendedBy:
      typeof change.recommendedBy === "string"
        ? change.recommendedBy
        : row.contributorContact ?? row.contributorUserId ?? "",
    recommendReason:
      typeof change.recommendReason === "string"
        ? change.recommendReason
        : row.reason ?? categories.join(", "),
    contact: row.contributorContact ?? "",
    createdAt: formatDateTime(row.createdAt),
  };
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/_admin");

  const role = (session.user as { role?: string }).role;
  if (!isAdminRole(role)) {
    return (
      <main className="page admin-page">
        <p>{messages.admin.loginRequired}</p>
      </main>
    );
  }

  const [dashboard, sourceRows, promoted, reports, feedback, contributions] = await Promise.all([
    loadAdminDashboard(),
    listManagedSources(),
    listPromotedEvents(),
    listRecentReports(),
    listFeedback(),
    listContributions(),
  ]);
  const sources = await checkManagedSourcesFetchHealth(sourceRows);

  // 点6 切片E：每信源的主理人判决 + 事件标注聚合（亲和度/晋降级建议）。
  const [sourceVerdicts, { profile }] = await Promise.all([
    getOwnerAnnotations("source", sources.map((s) => s.id)),
    loadOwnerAffinityProfile(),
  ]);
  const annotationCells: Record<string, SourceAnnotationCell> = {};
  for (const s of sources) {
    const entry = profile.source.get(s.id);
    annotationCells[s.id] = {
      verdict: sourceVerdicts.get(s.id) ?? null,
      affinity: entry ? { n: entry.n, affinity: entry.affinity } : null,
      suggestion: sourceAffinitySuggestion(entry),
    };
  }

  const pc = messages.admin.promotionColumns;
  const rc = messages.admin.reportColumns;
  const fc = messages.admin.feedbackColumns;
  const canModerateSources = can(role, "source.moderate");
  const sourceReviewItems = contributions
    .map(sourceReviewItem)
    .filter((item): item is SourceRecommendationReviewItem => item !== null);

  return (
    <main className="page admin-page">
      <header className="masthead">
        <h1 style={{ fontSize: "1.8rem" }}>{messages.admin.title}</h1>
        <nav>
          <span className="tagline">
            信源、精选、报告与审核 · <Link href="/_admin/annotations">主理人标注台</Link> ·{" "}
            <Link href="/_admin/routing">{messages.admin.routing.title}</Link>
          </span>
        </nav>
      </header>

      <AdminDashboard data={dashboard} />

      <SourceManagementSection
        rows={sources}
        reviewItems={sourceReviewItems}
        canModerateSources={canModerateSources}
        annotationCells={annotationCells}
      />

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>
        {messages.admin.promotions}
      </h2>
      {promoted.length === 0 ? (
        <div className="empty">{messages.admin.noPromotions}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{pc.title}</th>
              <th>{pc.level}</th>
              <th>{pc.score}</th>
              <th>{pc.threshold}</th>
              <th>{pc.window}</th>
              <th>{pc.rank}</th>
              <th>{pc.promotedAt}</th>
            </tr>
          </thead>
          <tbody>
            {promoted.map((ev: PromotedEventRow) => (
              <tr key={ev.id}>
                <td data-label={pc.title} style={{ maxWidth: 320 }}>{ev.title}</td>
                <td data-label={pc.level}>
                  <span className={`badge ${ev.selectedLevel}`}>
                    {ev.selectedLabel ?? ev.selectedLevel}
                  </span>
                </td>
                <td data-label={pc.score}>{selectedScore(ev)?.toFixed(1) ?? "—"}</td>
                <td data-label={pc.threshold}>{ev.breakdown?.threshold ?? "—"}</td>
                <td data-label={pc.window}>{ev.breakdown?.windowDays ?? "—"}</td>
                <td data-label={pc.rank}>
                  {ev.breakdown
                    ? `${ev.breakdown.rankInWindow} / ${ev.breakdown.slotLimit}`
                    : "—"}
                </td>
                <td data-label={pc.promotedAt}>{formatDateTime(ev.promotedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>
        {messages.admin.reports}
      </h2>
      {reports.length === 0 ? (
        <div className="empty">{messages.admin.noReports}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{rc.kind}</th>
              <th>{rc.date}</th>
              <th>{rc.status}</th>
              <th>{rc.summary}</th>
              <th>{rc.generatedAt}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r: AdminReportRow) => (
              <tr key={`${r.kind}-${r.date}`}>
                <td data-label={rc.kind}>{messages.report.kind[r.kind]}</td>
                <td data-label={rc.date} style={{ fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                <td data-label={rc.status}>
                  <span className={`pill ${r.status === "published" ? "healthy" : "degraded"}`}>
                    {messages.admin.reportStatus[r.status]}
                  </span>
                </td>
                <td data-label={rc.summary} style={{ color: "var(--ink-faint)", maxWidth: 280 }}>{r.summary ?? ""}</td>
                <td data-label={rc.generatedAt}>{formatDateTime(r.generatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontFamily: "var(--font-serif)", marginTop: "3rem" }}>
        {messages.admin.feedback}
      </h2>
      {feedback.length === 0 ? (
        <div className="empty">{messages.admin.noFeedback}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{fc.body}</th>
              <th>{fc.contact}</th>
              <th>{fc.fingerprint}</th>
              <th>{fc.createdAt}</th>
            </tr>
          </thead>
          <tbody>
            {feedback.map((row: FeedbackRow) => (
              <tr key={row.id}>
                <td data-label={fc.body} style={{ maxWidth: 520 }}>{row.body}</td>
                <td data-label={fc.contact} style={{ color: "var(--ink-faint)" }}>{row.contact ?? ""}</td>
                <td data-label={fc.fingerprint} style={{ color: "var(--ink-faint)" }}>
                  {row.fingerprint ? row.fingerprint.slice(0, 12) : messages.admin.feedbackAnon}
                </td>
                <td data-label={fc.createdAt}>{formatDateTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
