// Reader homepage — "All AI Dynamics" with server-side search + filtering (Slice 5).
// (reader) is a route group, so this renders at "/". Filters live in the URL (URL-as-state),
// resolved server-side via parsePublicQuery, then fetched with searchEvents. Dynamic: it reads
// the DB per request and degrades to a setup hint if the DB isn't reachable yet.
//
// Slice 8: hydrates the viewer's reaction state (liked/starred per event) using either
// the session user id or the signed `rid` cookie that middleware planted on first visit.

import { cookies } from "next/headers";
import { type CSSProperties } from "react";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { searchEvents, type EventCard as EventCardData, type FeedFilter } from "@/db/queries/feed";
import { getOwnerAnnotations, type AnnotationVerdict } from "@/db/queries/owner-annotations";
import { getViewerReactions, type ViewerReactionState } from "@/db/queries/reactions";
import { getTopCommentsForEvents } from "@/db/queries/comments";
import { listCurrentHotspots, type CurrentHotspot } from "@/db/queries/current-hotspots";
import { listSourceOptions, type SourceOption } from "@/db/queries/sources";
import { getUserPreference } from "@/db/queries/user-preferences";
import { messages } from "@/i18n";
import { log } from "@/log";
import { parsePublicQuery, type PublicQuery } from "@/public/query";
import { formatDateTime, formatTimeOfDay, toIsoAttr } from "@/app/_lib/format";
import { modelAccent } from "@/app/_lib/model-accent";
import { buildTimelineTree } from "@/app/_lib/timeline-tree";
import { CollapsibleGroup } from "./collapsible-group";
import { CurrentHotspots } from "./current-hotspots";
import { EventCard } from "./event-card";
import { NotificationBell } from "./masthead-account";
import { ParticleBackground } from "./particle-background";
import { ReaderNavSidebar } from "./reader-nav-sidebar";
import { ReaderSidebar, type SidebarEventItem } from "./reader-sidebar";
import { SearchBar } from "./search-bar";
import { SpotlightCard } from "./spotlight-card";

// Visual weight of a timeline card (decision: depth/emphasis ∝ curation, not raw size).
// Promotion level leads; for un-promoted items we fall back to the quality score so a
// strong-but-unselected item still reads louder than noise. The card then renders a
// level-tiered subset of fields (reason/comments) to match this weight.
function effectiveScore(event: EventCardData): number {
  if (typeof event.qualityScore === "number") return event.qualityScore;
  const byLevel: Record<EventCardData["selectedLevel"], number> = {
    S: 90,
    A: 75,
    B: 60,
    none: 45,
  };
  return byLevel[event.selectedLevel];
}

function cardEmphasis(event: EventCardData): "featured" | "standard" | "compact" {
  if (event.selectedLevel === "S" || event.selectedLevel === "A") return "featured";
  if (event.selectedLevel === "B") return "standard";
  return effectiveScore(event) >= 60 ? "standard" : "compact";
}

function handledErrorDetails(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { message: String(error) };
  const details: Record<string, string> = { name: error.name };
  if (error.message) details.message = error.message;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") details.code = code;
  return details;
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.home.heading} · ${messages.appName}`,
  description: messages.home.subheading,
};

type SearchParams = Record<string, string | string[] | undefined>;

const HOME_LIMIT = 30;
// "加载更多" raises the limit in HOME_LIMIT steps via the `limit` URL param (URL-as-state:
// shareable, SSR-only, no client fetch layer). Capped so a hand-edited URL can't dump
// the whole table into one render.
const HOME_LIMIT_MAX = 150;
const HOTSPOT_CANDIDATE_LIMIT = 80;

function parseHomeLimit(sp: SearchParams): number {
  const raw = sp.limit;
  const value = typeof raw === "string" ? Number(raw) : Array.isArray(raw) ? Number(raw[0]) : NaN;
  if (!Number.isFinite(value) || value <= HOME_LIMIT) return HOME_LIMIT;
  return Math.min(Math.floor(value), HOME_LIMIT_MAX);
}

/** Same-page link that keeps every active filter and only bumps `limit`. */
function loadMoreHref(sp: SearchParams, nextLimit: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  params.set("limit", String(nextLimit));
  return `/?${params.toString()}`;
}

function toQuery(sp: SearchParams): PublicQuery {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  return parsePublicQuery(params);
}

function toFeedFilter(query: PublicQuery): FeedFilter {
  return {
    mode: query.mode,
    since: query.since,
    q: query.q,
    tags: query.tags,
    sourceTypes: query.sourceTypes,
    sourceCategories: query.sourceCategories,
    sourceIds: query.sourceIds,
    level: query.level,
    minScore: query.minScore,
    category: query.category,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

async function loadHomeData(
  query: PublicQuery,
  limit: number,
): Promise<{ events: EventCardData[]; hotspots: CurrentHotspot[] }> {
  try {
    const candidates = await searchEvents(
      toFeedFilter(query),
      Math.max(limit, HOTSPOT_CANDIDATE_LIMIT),
    );
    const events = candidates.slice(0, limit);
    try {
      const hotspots = await listCurrentHotspots(candidates.map((event) => event.id));
      return { events, hotspots };
    } catch (error) {
      log.warn("[reader] loadHotspots failed", handledErrorDetails(error));
      return { events, hotspots: [] };
    }
  } catch (error) {
    // No DB yet (fresh clone before migrate/seed) → show the setup hint, don't crash.
    // Warn with a plain summary only: raw Error objects in an RSC render trigger Next's
    // dev overlay even when the failure is handled and the page safely degrades.
    log.warn("[reader] loadEvents unavailable", handledErrorDetails(error));
    return { events: [], hotspots: [] };
  }
}

async function loadViewerReactions(
  eventIds: string[],
): Promise<Map<string, ViewerReactionState>> {
  if (eventIds.length === 0) return new Map();
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  let fingerprint: string | null = null;
  if (!userId) {
    const ck = await cookies();
    const raw = ck.get(READER_ID_COOKIE)?.value;
    fingerprint = await verifyReaderId(raw);
  }
  if (!userId && !fingerprint) return new Map();
  try {
    return await getViewerReactions(eventIds, { userId, fingerprint });
  } catch (error) {
    log.warn("[reader] loadViewerReactions failed", error);
    return new Map();
  }
}

// 点6：主理人（owner/admin）在信息流上直接标注；非主理人返回 null（卡片不渲染按钮）。
async function loadOwnerAnnotations(
  eventIds: string[],
): Promise<Map<string, AnnotationVerdict> | null> {
  if (eventIds.length === 0) return null;
  try {
    const session = await getSession();
    const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
    if (role !== "owner" && role !== "admin") return null;
    return await getOwnerAnnotations("event", eventIds);
  } catch (error) {
    log.warn("[reader] loadOwnerAnnotations failed", handledErrorDetails(error));
    return null;
  }
}

async function loadTopComments(eventIds: string[]): Promise<Map<string, string[]>> {
  if (eventIds.length === 0) return new Map();
  try {
    return await getTopCommentsForEvents(eventIds, 3);
  } catch (error) {
    log.warn("[reader] loadTopComments failed", error);
    return new Map();
  }
}

// 精选是稀缺资产：冷启动或淡周时默认首页可能只有个位数精选卡片。低于这个数
// 时回退展示全部最新动态（精选徽标仍内联可见），显式点「精选」(URL 带 mode) 不回退。
const SPARSE_SELECTED_MIN = 6;

function isDefaultLanding(sp: SearchParams, query: PublicQuery): boolean {
  return (
    sp.mode === undefined &&
    sp.sources === undefined &&
    !query.q &&
    !query.tags?.length &&
    !query.level &&
    !query.sourceTypes?.length &&
    !query.sourceCategories?.length &&
    typeof query.minScore !== "number" &&
    !query.dateFrom &&
    !query.dateTo &&
    !query.category
  );
}

// 登录读者的默认信源筛选（bestblogs 式定制）：URL 未显式带 sources 参数时应用保存的偏好。
async function applySavedSourceDefaults(
  sp: SearchParams,
  query: PublicQuery,
): Promise<{ query: PublicQuery; defaultApplied: boolean; isLoggedIn: boolean }> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return { query, defaultApplied: false, isLoggedIn: false };
  if (sp.sources !== undefined) return { query, defaultApplied: false, isLoggedIn: true };
  try {
    const pref = await getUserPreference(userId);
    if (pref && pref.defaultSourceIds.length > 0) {
      return {
        query: { ...query, sourceIds: pref.defaultSourceIds },
        defaultApplied: true,
        isLoggedIn: true,
      };
    }
  } catch (error) {
    log.warn("[reader] applySavedSourceDefaults failed", handledErrorDetails(error));
  }
  return { query, defaultApplied: false, isLoggedIn: true };
}

async function loadSourceOptions(): Promise<SourceOption[]> {
  try {
    return await listSourceOptions();
  } catch (error) {
    log.warn("[reader] loadSourceOptions failed", handledErrorDetails(error));
    return [];
  }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const parsedQuery = toQuery(sp);
  const limit = parseHomeLimit(sp);
  const [{ query, defaultApplied, isLoggedIn }, sourceOptions] = await Promise.all([
    applySavedSourceDefaults(sp, parsedQuery),
    loadSourceOptions(),
  ]);
  let { events, hotspots } = await loadHomeData(query, limit);
  let usedLatestFallback = false;
  if (
    query.mode === "selected" &&
    events.length < SPARSE_SELECTED_MIN &&
    isDefaultLanding(sp, query)
  ) {
    const fallback = await loadHomeData({ ...query, mode: "all", since: "all" }, limit);
    if (fallback.events.length > events.length) {
      ({ events, hotspots } = fallback);
      usedLatestFallback = true;
    }
  }
  // A full page means there may be more; render the load-more link (limit+step, capped).
  const canLoadMore = events.length >= limit && limit < HOME_LIMIT_MAX;
  const eventIds: string[] = [];
  const commentEventIds: string[] = [];
  for (const event of events) {
    eventIds.push(event.id);
    if (event.selectedLevel === "A" || event.selectedLevel === "S") {
      commentEventIds.push(event.id);
    }
  }
  // Reactions and top-comments are independent; only A/S cards render comment highlights,
  // so don't query comment snippets for cards that cannot show them.
  const [reactions, topComments, ownerAnnotations] = await Promise.all([
    loadViewerReactions(eventIds),
    loadTopComments(commentEventIds),
    loadOwnerAnnotations(eventIds),
  ]);
  const m = messages;
  const isFiltered = Boolean(
    query.q ||
      query.tags?.length ||
      query.level ||
      query.sourceTypes?.length ||
      query.sourceCategories?.length ||
      query.sourceIds?.length ||
      typeof query.minScore === "number" ||
      query.dateFrom ||
      query.dateTo ||
      query.mode === "selected",
  );
  // 点8：速览栏是快速标题看板，跟随当前筛选（items 直接取自筛选后的 events）。
  const sidebarItems: SidebarEventItem[] = events.slice(0, 12).map((event) => ({
    id: event.id,
    title: event.title,
    sourceName: event.sourceName,
    when: formatDateTime(event.publishedAt ?? event.promotedAt ?? event.createdAt),
    selectedLabel: event.selectedLabel,
    viewCount: event.viewCount,
  }));

  return (
    <main className="page reader-home">
      <ParticleBackground />
      <ReaderNavSidebar />
      <div className="reader-control-strip">
        <ReaderSidebar items={sidebarItems} />
        <NotificationBell />
      </div>
      <SearchBar
        sourceOptions={sourceOptions}
        isLoggedIn={isLoggedIn}
        defaultApplied={defaultApplied}
      />
      <CurrentHotspots items={hotspots} />

      <h2 className="section-intro" style={{ fontWeight: 600, color: "var(--ink)" }}>
        {m.home.heading}
      </h2>
      <p className="section-intro">
        {m.home.subheading}
        {events[0] && (
          <span className="last-updated">
            {m.home.lastUpdated(
              formatDateTime(events[0].publishedAt ?? events[0].promotedAt ?? events[0].createdAt),
            )}
          </span>
        )}
      </p>
      {usedLatestFallback && <p className="section-intro">{m.home.sparseSelectedNotice}</p>}

      {events.length === 0 ? (
        <div className="empty">{isFiltered ? m.search.empty : m.home.empty}</div>
      ) : (
        <div className="feed">
          {buildTimelineTree(events).map((year) => (
            <CollapsibleGroup
              key={year.key}
              level="year"
              heading={year.heading}
              count={year.count}
              defaultCollapsed={!year.onLatestPath}
            >
              {year.months.map((month) => (
                <CollapsibleGroup
                  key={month.key}
                  level="month"
                  heading={month.heading}
                  count={month.count}
                  defaultCollapsed={!month.onLatestPath}
                >
                  {month.weeks.map((week) => (
                    <CollapsibleGroup
                      key={week.key}
                      level="week"
                      heading={week.heading}
                      count={week.count}
                      defaultCollapsed={!week.onLatestPath}
                    >
                      {week.days.map((day) => (
                        <CollapsibleGroup
                          key={day.key}
                          level="day"
                          heading={day.heading}
                          count={day.count}
                          defaultCollapsed={!day.onLatestPath}
                        >
                          {day.items.map((event) => {
                            const r =
                              reactions.get(event.id) ?? {
                                liked: false,
                                starred: false,
                                downed: false,
                              };
                            const accent = modelAccent(event);
                            const when =
                              event.publishedAt ?? event.promotedAt ?? event.createdAt;
                            return (
                              <div
                                key={event.id}
                                className="tl-row"
                                style={{ "--card-accent": accent.rgb } as CSSProperties}
                              >
                                <div className="tl-rail">
                                  <time className="tl-time" dateTime={toIsoAttr(when)}>{formatTimeOfDay(when)}</time>
                                </div>
                                <span className="tl-dot" aria-hidden="true" />
                                <SpotlightCard
                                  accentRgb={accent.rgb}
                                  emphasis={cardEmphasis(event)}
                                >
                                  <EventCard
                                    event={event}
                                    liked={r.liked}
                                    starred={r.starred}
                                    downed={r.downed}
                                    accentLabel={accent.label}
                                    topComments={topComments.get(event.id)}
                                    ownerVerdict={
                                      ownerAnnotations
                                        ? ownerAnnotations.get(event.id) ?? null
                                        : undefined
                                    }
                                  />
                                </SpotlightCard>
                              </div>
                            );
                          })}
                        </CollapsibleGroup>
                      ))}
                    </CollapsibleGroup>
                  ))}
                </CollapsibleGroup>
              ))}
            </CollapsibleGroup>
          ))}
        </div>
      )}

      {canLoadMore && (
        <div className="load-more">
          <a href={loadMoreHref(sp, Math.min(limit + HOME_LIMIT, HOME_LIMIT_MAX))}>
            {m.loadMore.action}
          </a>
        </div>
      )}

      <p className="note">{m.card.summaryNote}</p>
    </main>
  );
}
