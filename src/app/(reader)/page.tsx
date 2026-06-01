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
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { searchEvents, type EventCard as EventCardData } from "@/db/queries/feed";
import { getViewerReactions } from "@/db/queries/reactions";
import { getTopCommentsForEvents } from "@/db/queries/comments";
import { messages } from "@/i18n";
import { parsePublicQuery, type PublicQuery } from "@/public/query";
import { formatTimeOfDay } from "@/app/_lib/format";
import { modelAccent } from "@/app/_lib/model-accent";
import { buildTimelineTree } from "@/app/_lib/timeline-tree";
import { CollapsibleGroup } from "./collapsible-group";
import { EventCard } from "./event-card";
import { ParticleBackground } from "./particle-background";
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

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.home.heading} · ${messages.appName}`,
  description: messages.home.subheading,
};

type SearchParams = Record<string, string | string[] | undefined>;

const HOME_LIMIT = 30;

// The homepage default is "all dynamics in time order"; parsePublicQuery defaults to selected,
// so only fall back to `all` when the reader hasn't chosen a mode.
function toQuery(sp: SearchParams): PublicQuery {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  if (!params.has("mode")) params.set("mode", "all");
  return parsePublicQuery(params);
}

async function loadEvents(query: PublicQuery): Promise<{ events: EventCardData[]; error: boolean }> {
  try {
    const events = await searchEvents(
      {
        mode: query.mode,
        since: query.since,
        q: query.q,
        tags: query.tags,
        sourceTypes: query.sourceTypes,
        level: query.level,
        category: query.category,
      },
      HOME_LIMIT,
    );
    return { events, error: false };
  } catch {
    // No DB yet (fresh clone before migrate/seed) — show the setup hint, don't crash.
    return { events: [], error: true };
  }
}

async function loadViewerReactions(
  eventIds: string[],
): Promise<Map<string, { liked: boolean; starred: boolean }>> {
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
  } catch {
    return new Map();
  }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = toQuery(await searchParams);
  const { events } = await loadEvents(query);
  const eventIds = events.map((e) => e.id);
  const reactions = await loadViewerReactions(eventIds);
  let topComments = new Map<string, string[]>();
  try {
    topComments = await getTopCommentsForEvents(eventIds, 3);
  } catch {
    topComments = new Map();
  }
  const m = messages;
  const isFiltered = Boolean(query.q || query.tags?.length || query.level || query.mode === "selected");

  return (
    <main className="page reader-home">
      <ParticleBackground />
      <header className="masthead">
        <div>
          <h1>
            {m.appName}
            <span className="accent-dot">.</span>
          </h1>
        </div>
        <nav>
          <span className="tagline">{m.tagline}</span>
          <Link href="/reports">{m.nav.reports}</Link>
          <Link href="/changelog">{m.nav.changelog}</Link>
          <Link href="/about">{m.nav.about}</Link>
          <Link href="/recommend-source">{m.nav.recommendSource}</Link>
          <Link href="/feedback">{m.nav.feedback}</Link>
        </nav>
      </header>

      <h2 className="section-intro" style={{ fontWeight: 600, color: "var(--ink)" }}>
        {m.home.heading}
      </h2>
      <p className="section-intro">{m.home.subheading}</p>

      {/* SearchBar reads useSearchParams; a Suspense boundary keeps that from opting the
          whole page out of server rendering (Next.js CSR-bailout). */}
      <Suspense fallback={<section className="search" aria-hidden="true" />}>
        <SearchBar />
      </Suspense>

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
                              reactions.get(event.id) ?? { liked: false, starred: false };
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
                                  <time className="tl-time">{formatTimeOfDay(when)}</time>
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
                                    accentLabel={accent.label}
                                    topComments={topComments.get(event.id)}
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

      <p className="note">{m.card.summaryNote}</p>
    </main>
  );
}
