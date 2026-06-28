// Reader homepage — "All AI Dynamics" with server-side search + filtering (Slice 5).
// (reader) is a route group, so this renders at "/". Filters live in the URL (URL-as-state),
// resolved server-side via parsePublicQuery, then fetched with searchEvents. Dynamic: it reads
// the DB per request and degrades to a setup hint if the DB isn't reachable yet.
//
// Slice 8: hydrates the viewer's reaction state (liked/starred per event) using either
// the session user id or the signed `rid` cookie that middleware planted on first visit.

import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { resolveReaderIdentityServer } from "@/app/_lib/reader-identity";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { searchEvents, type EventCard as EventCardData, type FeedFilter } from "@/db/queries/feed";
import { listBoards } from "@/db/queries/topic-boards";
import { getOwnerAnnotations, type AnnotationVerdict } from "@/db/queries/owner-annotations";
import { getViewerReactions, type ViewerReactionState } from "@/db/queries/reactions";
import { getTopCommentsForEvents } from "@/db/queries/comments";
import { listCurrentHotspots, type CurrentHotspot } from "@/db/queries/current-hotspots";
import { listSourceOptions, type SourceOption } from "@/db/queries/sources";
import { getUserPreference } from "@/db/queries/user-preferences";
import { messages } from "@/i18n";
import { log } from "@/log";
import { EVENT_CATEGORIES, parsePublicQuery, type EventCategory, type PublicQuery } from "@/public/query";
import { formatDateTime, formatTimelineDate, formatTimeOfDay, toIsoAttr } from "@/app/_lib/format";
import { modelAccent } from "@/app/_lib/model-accent";
import { buildTimelineTree } from "@/app/_lib/timeline-tree";
import { CollapsibleGroup } from "./collapsible-group";
import { CurrentHotspots } from "./current-hotspots";
import { EventCard } from "./event-card";
import { FeedRefreshIndicator } from "./feed-refresh-indicator";
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

const HOME_LIMIT = 240;
const EVENT_CATEGORY_SET: ReadonlySet<string> = new Set(EVENT_CATEGORIES);
// "加载更多" raises the limit in HOME_LIMIT steps via the `limit` URL param (URL-as-state:
// shareable, SSR-only, no client fetch layer). Capped so a hand-edited URL can't dump
// the whole table into one render. Raised for the archive fix: history is never deleted, and
// the timeline collapse keeps older days folded, so a deep cap lets readers expand back through
// months of archive without the feed going blank past the old 150 ceiling.
const HOME_LIMIT_MAX = 5000;
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
  // Reader landing defaults to 最新 (latest, time-ordered). 精选 is opt-in via mode=selected.
  // (parsePublicQuery still defaults to "selected" for the public agent API — that contract
  // is unchanged; we only override the reader homepage here.)
  if (!params.has("mode")) params.set("mode", "all");
  return parsePublicQuery(params);
}

function refreshQueryString(sp: SearchParams, query: PublicQuery): string | null {
  if (query.mode === "personalized") return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "limit" || key === "cursor" || key === "take") continue;
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  params.set("mode", query.mode === "selected" ? "selected" : "all");
  if (query.sourceIds?.length && !params.has("sources")) {
    params.set("sources", query.sourceIds.join(","));
  }
  if (query.interests?.tags.length && !params.has("itags")) {
    params.set("itags", query.interests.tags.join(","));
  }
  if (query.interests?.sourceIds.length && !params.has("isources")) {
    params.set("isources", query.interests.sourceIds.join(","));
  }
  params.set("take", "1");
  return params.toString();
}

/** Carry the active board interest into the 主题简报 link (/brief?itags=…&isources=…). */
function briefQuery(interests: { tags: string[]; sourceIds: string[] }): URLSearchParams {
  const params = new URLSearchParams();
  if (interests.tags.length) params.set("itags", interests.tags.join(","));
  if (interests.sourceIds.length) params.set("isources", interests.sourceIds.join(","));
  return params;
}

function availableCategories(events: EventCardData[]): EventCategory[] {
  const seen = new Set<EventCategory>();
  for (const event of events) {
    if (event.category && EVENT_CATEGORY_SET.has(event.category)) {
      seen.add(event.category as EventCategory);
    }
  }
  return EVENT_CATEGORIES.filter((category) => seen.has(category));
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
    interests: query.interests,
    level: query.level,
    minScore: query.minScore,
    category: query.category,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

async function loadHomeData(query: PublicQuery, limit: number): Promise<EventCardData[]> {
  try {
    const candidates = await searchEvents(toFeedFilter(query), limit);
    return candidates.slice(0, limit);
  } catch (error) {
    // No DB yet (fresh clone before migrate/seed) → show the setup hint, don't crash.
    // Warn with a plain summary only: raw Error objects in an RSC render trigger Next's
    // dev overlay even when the failure is handled and the page safely degrades.
    log.warn("[reader] loadEvents unavailable", handledErrorDetails(error));
    return [];
  }
}

// 当前热点 (v0.5 fix #5): 固定按全站近期事件计算，与当前模式/筛选无关——最新/精选/筛选下
// 都展示同一份「客观热点」，不再随当前视图的卡片集变化。Best-effort：失败则空。
async function loadGlobalHotspots(): Promise<CurrentHotspot[]> {
  try {
    const recentQuery = parsePublicQuery(new URLSearchParams("mode=all&since=week"));
    const recent = await searchEvents(toFeedFilter(recentQuery), HOTSPOT_CANDIDATE_LIMIT);
    return await listCurrentHotspots(recent.map((event) => event.id));
  } catch (error) {
    log.warn("[reader] loadGlobalHotspots failed", handledErrorDetails(error));
    return [];
  }
}

interface ReaderInterestState {
  hasBoards: boolean;
  interests: { tags: string[]; sourceIds: string[] };
}

const EMPTY_INTERESTS: ReaderInterestState = { hasBoards: false, interests: { tags: [], sourceIds: [] } };

// 推荐 ↔ 主题板联动 (v0.5 B): fold all the reader's boards into one interest (tags ∪ sources).
// hasBoards gates the 推荐 tab; the union drives the 推荐 feed. Best-effort — no identity / no
// boards / any failure leaves 推荐 hidden and the feed on 最新.
async function loadReaderInterests(): Promise<ReaderInterestState> {
  try {
    const identity = await resolveReaderIdentityServer();
    if (!identity) return EMPTY_INTERESTS;
    const boards = await listBoards(identity);
    if (boards.length === 0) return EMPTY_INTERESTS;
    const tags = new Set<string>();
    const sourceIds = new Set<string>();
    for (const board of boards) {
      for (const tag of board.tags) tags.add(tag);
      for (const id of board.sourceIds) sourceIds.add(id);
    }
    return { hasBoards: true, interests: { tags: [...tags], sourceIds: [...sourceIds] } };
  } catch (error) {
    log.warn("[reader] loadReaderInterests failed", handledErrorDetails(error));
    return EMPTY_INTERESTS;
  }
}

// 推荐 mode (v0.5 B): the reader's boards as one interest (tags ∪ sources), in strict time
// order like 最新 — just narrowed to what they follow (no behavioral ranking). No boards →
// recent feed; 推荐 is hidden then, but a hand-typed mode=personalized never shows empty.
async function loadPersonalizedData(
  query: PublicQuery,
  limit: number,
  reader: ReaderInterestState,
): Promise<EventCardData[]> {
  const personalized: PublicQuery = reader.hasBoards
    ? { ...query, mode: "all", interests: reader.interests }
    : { ...query, mode: "all" };
  return loadHomeData(personalized, limit);
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
  const [{ query, defaultApplied, isLoggedIn }, sourceOptions, readerInterests, hotspots] =
    await Promise.all([
      applySavedSourceDefaults(sp, parsedQuery),
      loadSourceOptions(),
      loadReaderInterests(),
      loadGlobalHotspots(),
    ]);
  const events =
    query.mode === "personalized"
      ? await loadPersonalizedData(query, limit, readerInterests)
      : await loadHomeData(query, limit);
  const latestEvent = events[0];
  const latestKey = latestEvent
    ? `${latestEvent.id}:${latestEvent.publishedAt?.toISOString() ?? ""}:${latestEvent.promotedAt?.toISOString() ?? ""}`
    : null;
  const refreshQuery = refreshQueryString(sp, query);
  // 精选(mode=selected)显示真实精选集，稀少时如实显示少量/空，不再静默回退最新——
  // 避免「点了精选却和最新一样」的误解。落地默认已是最新。
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
      query.interests ||
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
  const availableEventCategories = availableCategories(events);

  return (
    <main className="page reader-home">
      <ParticleBackground />
      <ReaderNavSidebar />
      <div className="reader-control-strip">
        <ReaderSidebar items={sidebarItems} />
      </div>
      <FeedRefreshIndicator latestKey={latestKey} refreshQuery={refreshQuery} />
      <Suspense fallback={null}>
        <SearchBar
          sourceOptions={sourceOptions}
          availableEventCategories={availableEventCategories}
          isLoggedIn={isLoggedIn}
          defaultApplied={defaultApplied}
          hasBoards={readerInterests.hasBoards}
        />
      </Suspense>
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
      {query.interests && (
        <p className="section-intro board-active-note">
          {m.home.boardFilterActive}
          <Link href={`/brief?${briefQuery(query.interests).toString()}`}>{m.home.boardFilterBrief}</Link>
          <Link href="/">{m.home.boardFilterClear}</Link>
        </p>
      )}

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
              defaultCollapsed={!year.defaultExpanded}
            >
              {year.months.map((month) => (
                <CollapsibleGroup
                  key={month.key}
                  level="month"
                  heading={month.heading}
                  count={month.count}
                  defaultCollapsed={!month.defaultExpanded}
                >
                  {month.weeks.map((week) => (
                    <CollapsibleGroup
                      key={week.key}
                      level="week"
                      heading={week.heading}
                      count={week.count}
                      defaultCollapsed={!week.defaultExpanded}
                    >
                      {week.days.map((day) => (
                        <CollapsibleGroup
                          key={day.key}
                          level="day"
                          heading={day.heading}
                          count={day.count}
                          defaultCollapsed={!day.defaultExpanded}
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
                                  <time className="tl-date" dateTime={toIsoAttr(when)}>{formatTimelineDate(when)}</time>
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
          <Link href={loadMoreHref(sp, Math.min(limit + HOME_LIMIT, HOME_LIMIT_MAX))}>
            {m.loadMore.action}
          </Link>
        </div>
      )}

      <p className="note">{m.card.summaryNote}</p>
    </main>
  );
}
