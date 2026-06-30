import { sql } from "drizzle-orm";
import { APP_TZ } from "@/core/time";
import { db as defaultDb, type DB } from "@/db/client";
import {
  contributions,
  eventComments,
  eventReactions,
  eventViews,
  events,
  feedback,
  llmSpendLedger,
  posts,
  sources,
} from "@/db/schema";

export interface AdminDashboardMetric {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn" | "bad";
  hint: string;
}

export interface DailyOpsRow {
  day: string;
  posts: number;
  events: number;
  selected: number;
  views: number;
  providerErrors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface SourceOutputRow {
  id: string;
  name: string;
  platform: string;
  healthStatus: string;
  posts: number;
  events: number;
  selected: number;
  failed: number;
  lastFetchAt: Date | null;
}

export interface SourceHealthRow {
  healthStatus: string;
  platform: string;
  count: number;
}

export interface LlmSpendRow {
  task: string;
  provider: string;
  modelId: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TopEventRow {
  id: string;
  title: string;
  sourceName: string | null;
  viewCount: number;
  likeCount: number;
  starCount: number;
  selectedLevel: string;
}

export interface AdminDashboardData {
  metrics: AdminDashboardMetric[];
  daily: DailyOpsRow[];
  sourceHealth: SourceHealthRow[];
  sourceOutput: SourceOutputRow[];
  llmSpend: LlmSpendRow[];
  topEvents: TopEventRow[];
}

function resultRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  return ((raw as { rows?: T[] }).rows ?? []);
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(n);
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export async function loadAdminDashboard(db: DB = defaultDb): Promise<AdminDashboardData> {
  const tz = APP_TZ;
  const [dailyRaw, sourceHealthRaw, sourceOutputRaw, llmRaw, topEventsRaw, totalsRaw] =
    await Promise.all([
      db.execute(sql<DailyOpsRow>`
        WITH days AS (
          SELECT generate_series(
            date(timezone(${tz}, now())) - interval '6 days',
            date(timezone(${tz}, now())),
            interval '1 day'
          )::date AS day
        ),
        post_counts AS (
          SELECT
            date(timezone(${tz}, coalesce(${posts.publishedAt}, ${posts.fetchedAt}, ${posts.createdAt}))) AS day,
            count(*)::int AS posts,
            count(*) FILTER (WHERE ${posts.judgeError} = 'provider_error')::int AS provider_errors
          FROM ${posts}
          WHERE coalesce(${posts.publishedAt}, ${posts.fetchedAt}, ${posts.createdAt}) >= now() - interval '8 days'
          GROUP BY 1
        ),
        event_counts AS (
          SELECT
            date(timezone(${tz}, coalesce(${events.publishedAt}, ${events.promotedAt}, ${events.createdAt}))) AS day,
            count(*)::int AS events,
            count(*) FILTER (WHERE ${events.selectedLevel} <> 'none')::int AS selected
          FROM ${events}
          WHERE coalesce(${events.publishedAt}, ${events.promotedAt}, ${events.createdAt}) >= now() - interval '8 days'
          GROUP BY 1
        ),
        view_counts AS (
          SELECT date(timezone(${tz}, ${eventViews.createdAt})) AS day, count(*)::int AS views
          FROM ${eventViews}
          WHERE ${eventViews.createdAt} >= now() - interval '8 days'
          GROUP BY 1
        ),
        spend_counts AS (
          SELECT
            date(timezone(${tz}, ${llmSpendLedger.createdAt})) AS day,
            coalesce(sum(${llmSpendLedger.inputTokens}), 0)::int AS input_tokens,
            coalesce(sum(${llmSpendLedger.outputTokens}), 0)::int AS output_tokens,
            coalesce(sum(${llmSpendLedger.costUsd}), 0)::float8 AS cost_usd
          FROM ${llmSpendLedger}
          WHERE ${llmSpendLedger.createdAt} >= now() - interval '8 days'
          GROUP BY 1
        )
        SELECT
          to_char(days.day, 'YYYY-MM-DD') AS day,
          coalesce(post_counts.posts, 0)::int AS posts,
          coalesce(event_counts.events, 0)::int AS events,
          coalesce(event_counts.selected, 0)::int AS selected,
          coalesce(view_counts.views, 0)::int AS views,
          coalesce(post_counts.provider_errors, 0)::int AS "providerErrors",
          coalesce(spend_counts.input_tokens, 0)::int AS "inputTokens",
          coalesce(spend_counts.output_tokens, 0)::int AS "outputTokens",
          coalesce(spend_counts.cost_usd, 0)::float8 AS "costUsd"
        FROM days
        LEFT JOIN post_counts ON post_counts.day = days.day
        LEFT JOIN event_counts ON event_counts.day = days.day
        LEFT JOIN view_counts ON view_counts.day = days.day
        LEFT JOIN spend_counts ON spend_counts.day = days.day
        ORDER BY days.day DESC
      `),
      db.execute(sql<SourceHealthRow>`
        SELECT ${sources.healthStatus} AS "healthStatus", ${sources.platform} AS platform, count(*)::int AS count
        FROM ${sources}
        WHERE ${sources.archivedAt} IS NULL
        GROUP BY 1, 2
        ORDER BY count DESC, platform ASC
      `),
      db.execute(sql<SourceOutputRow>`
        WITH post_recent AS (
          SELECT
            ${posts.sourceId} AS source_id,
            count(*)::int AS posts,
            count(*) FILTER (WHERE ${posts.judgeError} IS NOT NULL)::int AS failed
          FROM ${posts}
          WHERE ${posts.createdAt} >= now() - interval '7 days'
          GROUP BY ${posts.sourceId}
        ),
        event_recent AS (
          SELECT
            ${events.mainSourceId} AS source_id,
            count(*)::int AS events,
            count(*) FILTER (WHERE ${events.selectedLevel} <> 'none')::int AS selected
          FROM ${events}
          WHERE ${events.createdAt} >= now() - interval '7 days'
          GROUP BY ${events.mainSourceId}
        )
        SELECT
          ${sources.id} AS id,
          ${sources.name} AS name,
          ${sources.platform} AS platform,
          ${sources.healthStatus} AS "healthStatus",
          coalesce(post_recent.posts, 0)::int AS posts,
          coalesce(event_recent.events, 0)::int AS events,
          coalesce(event_recent.selected, 0)::int AS selected,
          coalesce(post_recent.failed, 0)::int AS failed,
          ${sources.lastFetchAt} AS "lastFetchAt"
        FROM ${sources}
        LEFT JOIN post_recent ON post_recent.source_id = ${sources.id}
        LEFT JOIN event_recent ON event_recent.source_id = ${sources.id}
        WHERE ${sources.archivedAt} IS NULL
        ORDER BY selected DESC, events DESC, posts DESC, failed DESC, ${sources.name} ASC
        LIMIT 12
      `),
      db.execute(sql<LlmSpendRow>`
        SELECT
          ${llmSpendLedger.task} AS task,
          ${llmSpendLedger.provider} AS provider,
          ${llmSpendLedger.modelId} AS "modelId",
          count(*)::int AS calls,
          coalesce(sum(${llmSpendLedger.inputTokens}), 0)::int AS "inputTokens",
          coalesce(sum(${llmSpendLedger.outputTokens}), 0)::int AS "outputTokens",
          coalesce(sum(${llmSpendLedger.costUsd}), 0)::float8 AS "costUsd"
        FROM ${llmSpendLedger}
        WHERE ${llmSpendLedger.createdAt} >= now() - interval '30 days'
        GROUP BY 1, 2, 3
        ORDER BY "costUsd" DESC, calls DESC
        LIMIT 8
      `),
      db.execute(sql<TopEventRow>`
        SELECT
          ${events.id} AS id,
          ${events.title} AS title,
          ${sources.name} AS "sourceName",
          ${events.viewCount}::int AS "viewCount",
          ${events.likeCount}::int AS "likeCount",
          ${events.starCount}::int AS "starCount",
          ${events.selectedLevel} AS "selectedLevel"
        FROM ${events}
        LEFT JOIN ${sources} ON ${sources.id} = ${events.mainSourceId}
        ORDER BY ${events.viewCount} DESC, ${events.updatedAt} DESC
        LIMIT 8
      `),
      db.execute(sql<{
        posts48h: number;
        providerErrors48h: number;
        events48h: number;
        selected48h: number;
        views7d: number;
        reactions7d: number;
        comments7d: number;
        feedback7d: number;
        contributions7d: number;
        failingX: number;
        spend30d: number;
      }>`
        SELECT
          (SELECT count(*)::int FROM ${posts} WHERE ${posts.createdAt} >= now() - interval '48 hours') AS "posts48h",
          (SELECT count(*)::int FROM ${posts} WHERE ${posts.createdAt} >= now() - interval '48 hours' AND ${posts.judgeError} = 'provider_error') AS "providerErrors48h",
          (SELECT count(*)::int FROM ${events} WHERE ${events.createdAt} >= now() - interval '48 hours') AS "events48h",
          (SELECT count(*)::int FROM ${events} WHERE ${events.createdAt} >= now() - interval '48 hours' AND ${events.selectedLevel} <> 'none') AS "selected48h",
          (SELECT count(*)::int FROM ${eventViews} WHERE ${eventViews.createdAt} >= now() - interval '7 days') AS "views7d",
          (SELECT count(*)::int FROM ${eventReactions} WHERE ${eventReactions.createdAt} >= now() - interval '7 days') AS "reactions7d",
          (SELECT count(*)::int FROM ${eventComments} WHERE ${eventComments.createdAt} >= now() - interval '7 days') AS "comments7d",
          (SELECT count(*)::int FROM ${feedback} WHERE ${feedback.createdAt} >= now() - interval '7 days') AS "feedback7d",
          (SELECT count(*)::int FROM ${contributions} WHERE ${contributions.createdAt} >= now() - interval '7 days') AS "contributions7d",
          (SELECT count(*)::int FROM ${sources} WHERE ${sources.archivedAt} IS NULL AND ${sources.platform} = 'x' AND ${sources.healthStatus} IN ('disabled', 'degraded')) AS "failingX",
          (SELECT coalesce(sum(${llmSpendLedger.costUsd}), 0)::float8 FROM ${llmSpendLedger} WHERE ${llmSpendLedger.createdAt} >= now() - interval '30 days') AS "spend30d"
      `),
    ]);

  const daily = resultRows<DailyOpsRow>(dailyRaw).map((row) => ({
    day: row.day,
    posts: asNumber(row.posts),
    events: asNumber(row.events),
    selected: asNumber(row.selected),
    views: asNumber(row.views),
    providerErrors: asNumber(row.providerErrors),
    inputTokens: asNumber(row.inputTokens),
    outputTokens: asNumber(row.outputTokens),
    costUsd: asNumber(row.costUsd),
  }));
  const totals = resultRows<Record<string, unknown>>(totalsRaw)[0] ?? {};
  const providerErrors48h = asNumber(totals.providerErrors48h);
  const failingX = asNumber(totals.failingX);
  const events48h = asNumber(totals.events48h);
  const posts48h = asNumber(totals.posts48h);

  return {
    metrics: [
      {
        label: "48h 帖子 / 事件",
        value: `${fmtInt(posts48h)} / ${fmtInt(events48h)}`,
        tone: events48h === 0 && posts48h > 0 ? "bad" : "neutral",
        hint: "抓到原帖但没有事件时，优先查 LLM 判定链路。",
      },
      {
        label: "LLM provider_error",
        value: fmtInt(providerErrors48h),
        tone: providerErrors48h > 0 ? "bad" : "good",
        hint: "最近 48 小时判定失败积压。",
      },
      {
        label: "X 信源异常",
        value: fmtInt(failingX),
        tone: failingX > 0 ? "warn" : "good",
        hint: "大量异常通常是 RSSHub/Twitter token 问题。",
      },
      {
        label: "7 日访问/互动",
        value: `${fmtInt(asNumber(totals.views7d))} / ${fmtInt(asNumber(totals.reactions7d) + asNumber(totals.comments7d))}`,
        tone: "neutral",
        hint: "访问=站内详情去重浏览；互动=点赞收藏踩与评论。",
      },
      {
        label: "30 日 LLM 成本",
        value: fmtUsd(asNumber(totals.spend30d)),
        tone: asNumber(totals.spend30d) > 0 ? "neutral" : "warn",
        hint: "来自 llm_spend_ledger，按真实调用记账。",
      },
      {
        label: "7 日反馈/推荐",
        value: `${fmtInt(asNumber(totals.feedback7d))} / ${fmtInt(asNumber(totals.contributions7d))}`,
        tone: "neutral",
        hint: "反馈与信源推荐需要每次迭代前查看。",
      },
    ],
    daily,
    sourceHealth: resultRows<SourceHealthRow>(sourceHealthRaw).map((row) => ({
      healthStatus: row.healthStatus,
      platform: row.platform,
      count: asNumber(row.count),
    })),
    sourceOutput: resultRows<SourceOutputRow>(sourceOutputRaw).map((row) => ({
      ...row,
      posts: asNumber(row.posts),
      events: asNumber(row.events),
      selected: asNumber(row.selected),
      failed: asNumber(row.failed),
      lastFetchAt: row.lastFetchAt ? new Date(row.lastFetchAt) : null,
    })),
    llmSpend: resultRows<LlmSpendRow>(llmRaw).map((row) => ({
      ...row,
      calls: asNumber(row.calls),
      inputTokens: asNumber(row.inputTokens),
      outputTokens: asNumber(row.outputTokens),
      costUsd: asNumber(row.costUsd),
    })),
    topEvents: resultRows<TopEventRow>(topEventsRaw).map((row) => ({
      ...row,
      viewCount: asNumber(row.viewCount),
      likeCount: asNumber(row.likeCount),
      starCount: asNumber(row.starCount),
    })),
  };
}
