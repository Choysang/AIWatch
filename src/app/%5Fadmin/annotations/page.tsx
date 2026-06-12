// 点6 切片D：主理人标注台（意图画像自检页）。URL /_admin/annotations
// （%5Fadmin 同管理后台：URL-encoded 下划线，避开 App Router 私有目录约定）。
// 列出最近标注 + 各维度亲和度表；亲和度由 owner-affinity 纯函数聚合（确定性、可重算）。

import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/app/_lib/format";
import { getSession, isAdminRole } from "@/app/_lib/session";
import { loadOwnerAffinityProfile } from "@/db/jobs/recompute-rank-scores";
import { listRecentOwnerAnnotations } from "@/db/queries/owner-annotations";
import { db } from "@/db/client";
import { sources } from "@/db/schema";
import { messages } from "@/i18n";
import { rankScoreConfig } from "@/scoring/rank-score";
import type { AffinityTable } from "@/scoring/owner-affinity";

export const metadata = {
  title: `主理人标注台 · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function AffinitySection(props: {
  title: string;
  table: AffinityTable;
  labelFor?: (key: string) => string;
}) {
  const rows = [...props.table.entries()].sort((a, b) => b[1].affinity - a[1].affinity);
  return (
    <section className="admin-section">
      <h3 style={{ fontFamily: "var(--font-serif)" }}>{props.title}</h3>
      {rows.length === 0 ? (
        <div className="empty">暂无标注样本</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>维度值</th>
              <th>有用</th>
              <th>没用</th>
              <th>样本数</th>
              <th>亲和度</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, entry]) => (
              <tr key={key}>
                <td data-label="维度值">{props.labelFor?.(key) ?? key}</td>
                <td data-label="有用">{entry.useful}</td>
                <td data-label="没用">{entry.notUseful}</td>
                <td data-label="样本数">
                  {entry.n}
                  {entry.n < rankScoreConfig.owner.minSamples ? (
                    <span className="admin-muted">（不足 {rankScoreConfig.owner.minSamples}，暂不计入）</span>
                  ) : null}
                </td>
                <td data-label="亲和度" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {entry.affinity > 0 ? "+" : ""}
                  {entry.affinity.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AnnotationsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/_admin/annotations");
  const role = (session.user as { role?: string }).role;
  if (!isAdminRole(role)) {
    return (
      <main className="page admin-page">
        <p>{messages.admin.loginRequired}</p>
      </main>
    );
  }

  const [{ profile }, recent, sourceRows] = await Promise.all([
    loadOwnerAffinityProfile(),
    listRecentOwnerAnnotations(80),
    db.select({ id: sources.id, name: sources.name }).from(sources),
  ]);
  const sourceName = new Map(sourceRows.map((s) => [s.id, s.name]));

  return (
    <main className="page admin-page">
      <header className="masthead">
        <h1 style={{ fontSize: "1.8rem" }}>主理人标注台</h1>
        <nav>
          <span className="tagline">
            标注 → 偏好画像 → rank-v4 ownerBoost（直接判决 +{rankScoreConfig.owner.usefulBoost}/-
            {rankScoreConfig.owner.notUsefulPenalty}，亲和度 ±{rankScoreConfig.owner.affinityBoostMax}）
            · <Link href="/_admin">返回管理后台</Link>
          </span>
        </nav>
      </header>

      <AffinitySection
        title="信源亲和度"
        table={profile.source}
        labelFor={(key) => sourceName.get(key) ?? key}
      />
      <AffinitySection title="分类亲和度" table={profile.category} />
      <AffinitySection title="内容类型亲和度" table={profile.contentType} />
      <AffinitySection title="标签亲和度" table={profile.tag} />

      <section className="admin-section">
        <h3 style={{ fontFamily: "var(--font-serif)" }}>最近标注</h3>
        {recent.length === 0 ? (
          <div className="empty">还没有任何标注——去信息流卡片上点「有用 / 没用」开始训练偏好。</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>对象</th>
                <th>类型</th>
                <th>判决</th>
                <th>备注</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td data-label="对象" style={{ maxWidth: 360 }}>
                    {row.subjectLabel ?? row.subjectId}
                  </td>
                  <td data-label="类型">{row.subjectType === "event" ? "事件" : "信源"}</td>
                  <td data-label="判决">
                    <span className={`pill ${row.verdict === "useful" ? "healthy" : "unavailable"}`}>
                      {row.verdict === "useful" ? "有用" : "没用"}
                    </span>
                  </td>
                  <td data-label="备注" className="admin-soft">{row.note ?? ""}</td>
                  <td data-label="更新时间">{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
