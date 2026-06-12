import { formatDateOnly } from "@/app/_lib/format";
import { AnnotationButtons, type OwnerVerdict } from "@/app/(reader)/annotation-buttons";
import type { ManagedSourceRow } from "@/db/queries/sources";
import { sourceCategoryLabel } from "@/sources/ai-source-categories";
import { SourceAddDialog } from "./source-add-dialog";
import { SourceReviewDialog, type SourceRecommendationReviewItem } from "./source-review-dialog";
import { SourceBulkDeleteButton, SourceSelectAll, SourceTableResize } from "./source-selection";

const CONNECTOR_LABELS = [
  "rss",
  "github",
  "hn",
  "youtube_rss",
  "huggingface",
  "reddit",
  "rsshub",
  "mock",
  "manual",
] as const;
const BULK_DELETE_FORM_ID = "source-bulk-delete-form";
const SOURCES_TABLE_ID = "managed-sources-table";

const PLATFORM_LABEL: Record<string, string> = {
  x: "X / Twitter",
  github: "GitHub",
  reddit: "Reddit",
  hackernews: "Hacker News",
  blog: "博客",
  zhihu: "知乎",
  csdn: "CSDN",
  rss: "RSS",
  news: "新闻站",
  youtube: "YouTube",
  bilibili: "哔哩哔哩",
  huggingface: "Hugging Face",
  weibo: "微博",
};

const CONNECTOR_LABEL: Record<(typeof CONNECTOR_LABELS)[number], string> = {
  rss: "RSS 订阅（网站自带更新源）",
  github: "GitHub（暂未接入）",
  hn: "Hacker News（暂未接入）",
  youtube_rss: "YouTube RSS（暂未接入）",
  huggingface: "Hugging Face（暂未接入）",
  reddit: "Reddit（暂未接入）",
  rsshub: "RSSHub（适合 X、知乎、微博、B站）",
  mock: "演示数据（本地测试）",
  manual: "手动补录（不自动抓取）",
};

const SOURCE_PROFILE_LABEL = {
  official: "官方",
  industry_leader: "行业领袖",
  technical_share: "技术分享",
};

function platformLabel(value: string): string {
  return PLATFORM_LABEL[value] ?? value;
}

function connectorLabel(value: string): string {
  return CONNECTOR_LABEL[value as (typeof CONNECTOR_LABELS)[number]] ?? value;
}

function sourceProfileLabel(sourceType: string, level: string, categories: string[]): string {
  const categoryLabel = sourceCategoryLabel(categories[0]);
  if (categoryLabel) return categoryLabel;
  if (level === "L1") return SOURCE_PROFILE_LABEL.official;
  if (level === "L2") return SOURCE_PROFILE_LABEL.industry_leader;
  if (sourceType === "open_source_project" || sourceType === "community" || sourceType === "kol") {
    return SOURCE_PROFILE_LABEL.technical_share;
  }
  if (sourceType === "media" || sourceType === "expert" || level === "L4" || level === "L5") {
    return SOURCE_PROFILE_LABEL.technical_share;
  }
  return `${level} ${sourceType}`;
}

function sourceStatus(row: ManagedSourceRow): { label: string; className: string; reason: string } {
  if (!row.enabled || row.healthStatus === "paused") {
    return {
      label: "停用",
      className: "paused",
      reason: row.lastError ? `停用原因：${row.lastError}` : "停用原因：已停用，不会自动抓取",
    };
  }
  if (row.healthStatus === "healthy" && !row.lastError) {
    return { label: "正常", className: "healthy", reason: "最近抓取请求正常" };
  }
  return {
    label: "不可用",
    className: "unavailable",
    reason: row.lastError
      ? `不可用原因：${row.lastError}`
      : `不可用原因：抓取状态为 ${row.healthStatus}，暂无错误详情`,
  };
}

function HeaderCell(props: { children: React.ReactNode; colIndex: number; className?: string }) {
  return (
    <th className={props.className}>
      <span>{props.children}</span>
      <span className="admin-col-resizer" data-col-index={props.colIndex} aria-hidden="true" />
    </th>
  );
}

/** 点6 切片E：每信源的主理人判决 + 该源事件标注聚合（亲和度 + 晋降级建议）。 */
export interface SourceAnnotationCell {
  verdict: OwnerVerdict | null;
  /** Event-annotation aggregate for this source (null = no annotated events yet). */
  affinity: { n: number; affinity: number } | null;
  suggestion: "promote" | "demote" | null;
}

function SuggestionBadge({ suggestion }: { suggestion: "promote" | "demote" | null }) {
  if (!suggestion) return null;
  return (
    <span
      className={`pill ${suggestion === "promote" ? "healthy" : "unavailable"}`}
      title="基于事件标注聚合（|亲和度| ≥ 0.5 且样本 ≥ 5）的建议"
    >
      {suggestion === "promote" ? "建议入池" : "建议降级"}
    </span>
  );
}

export function SourceManagementSection(props: {
  rows: ManagedSourceRow[];
  reviewItems: SourceRecommendationReviewItem[];
  canModerateSources: boolean;
  annotationCells?: Record<string, SourceAnnotationCell>;
}) {
  const { rows, reviewItems, canModerateSources, annotationCells } = props;

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h2>已接入信源</h2>
        <div className="admin-section-actions">
          {canModerateSources ? <SourceAddDialog /> : null}
          {canModerateSources ? <SourceReviewDialog items={reviewItems} /> : null}
          {canModerateSources && rows.length > 0 ? (
            <>
              <form id={BULK_DELETE_FORM_ID} method="post" action="/api/_admin/sources">
                <input name="_action" type="hidden" value="delete" />
              </form>
              <SourceBulkDeleteButton formId={BULK_DELETE_FORM_ID} />
            </>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">暂无信源</div>
      ) : (
        <div className="admin-table-wrap admin-sources-table-wrap">
          <SourceTableResize tableId={SOURCES_TABLE_ID} />
          <table className="admin-table admin-resizable-table admin-sources-table" id={SOURCES_TABLE_ID}>
            <colgroup>
              {canModerateSources ? <col data-col-index={0} style={{ width: "3%" }} /> : null}
              <col data-col-index={canModerateSources ? 1 : 0} style={{ width: canModerateSources ? "14%" : "15%" }} />
              <col data-col-index={canModerateSources ? 2 : 1} style={{ width: canModerateSources ? "9%" : "10%" }} />
              <col data-col-index={canModerateSources ? 3 : 2} style={{ width: "15%" }} />
              <col data-col-index={canModerateSources ? 4 : 3} style={{ width: canModerateSources ? "17%" : "20%" }} />
              <col data-col-index={canModerateSources ? 5 : 4} style={{ width: canModerateSources ? "7%" : "8%" }} />
              <col data-col-index={canModerateSources ? 6 : 5} style={{ width: canModerateSources ? "11%" : "13%" }} />
              <col data-col-index={canModerateSources ? 7 : 6} style={{ width: "6%" }} />
              <col data-col-index={canModerateSources ? 8 : 7} style={{ width: "7%" }} />
              <col data-col-index={canModerateSources ? 9 : 8} style={{ width: canModerateSources ? "11%" : "12%" }} />
              {canModerateSources ? <col data-col-index={10} style={{ width: "5%" }} /> : null}
            </colgroup>
            <thead>
              <tr>
                {canModerateSources ? (
                  <HeaderCell className="admin-select-col" colIndex={0}>
                    <SourceSelectAll formId={BULK_DELETE_FORM_ID} />
                  </HeaderCell>
                ) : null}
                <HeaderCell colIndex={canModerateSources ? 1 : 0}>名称</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 2 : 1}>平台</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 3 : 2}>信源定位</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 4 : 3}>抓取方式</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 5 : 4}>状态</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 6 : 5}>推荐理由</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 7 : 6}>推荐人</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 8 : 7}>接入日期</HeaderCell>
                <HeaderCell colIndex={canModerateSources ? 9 : 8}>主理人标注</HeaderCell>
                {canModerateSources ? <HeaderCell colIndex={10}>操作</HeaderCell> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = sourceStatus(row);
                const cell = annotationCells?.[row.id];
                return (
                  <tr key={row.id}>
                    {canModerateSources ? (
                      <td className="admin-select-col" data-label="选择">
                        <input
                          aria-label={`选择信源 ${row.name}`}
                          form={BULK_DELETE_FORM_ID}
                          name="sourceIds"
                          type="checkbox"
                          value={row.id}
                        />
                      </td>
                    ) : null}
                    <td data-label="名称">
                      <strong>{row.name}</strong>
                      <div className="admin-muted">{row.handle ?? row.url ?? ""}</div>
                    </td>
                    <td data-label="平台">{platformLabel(row.platform)}</td>
                    <td data-label="信源定位">{sourceProfileLabel(row.sourceType, row.level, row.categories)}</td>
                    <td data-label="抓取方式">
                      {connectorLabel(row.connectorType)}
                      <div className="admin-muted">{row.connectorRef ?? ""}</div>
                    </td>
                    <td data-label="状态">
                      <span
                        aria-label={`${status.label}，${status.reason}`}
                        className={`pill ${status.className}`}
                        title={status.reason}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td data-label="推荐理由" className="admin-soft">{row.recommendReason ?? ""}</td>
                    <td data-label="推荐人" className="admin-soft">{row.recommendedBy ?? ""}</td>
                    <td data-label="接入日期">{formatDateOnly(row.onboardedAt)}</td>
                    <td data-label="主理人标注">
                      <AnnotationButtons
                        subjectId={row.id}
                        subjectType="source"
                        initialVerdict={cell?.verdict ?? null}
                      />
                      {cell?.affinity ? (
                        <div className="admin-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                          事件亲和 {cell.affinity.affinity > 0 ? "+" : ""}
                          {cell.affinity.affinity.toFixed(2)}（{cell.affinity.n} 条）{" "}
                          <SuggestionBadge suggestion={cell.suggestion} />
                        </div>
                      ) : null}
                    </td>
                    {canModerateSources ? (
                      <td data-label="操作">
                        <div className="admin-row-actions">
                          <form method="post" action="/api/_admin/sources">
                            <input name="_action" type="hidden" value="delete" />
                            <input name="sourceIds" type="hidden" value={row.id} />
                            <button className="admin-danger-link" type="submit">
                              删除
                            </button>
                          </form>
                          <span className="admin-row-resizer" aria-hidden="true" />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
