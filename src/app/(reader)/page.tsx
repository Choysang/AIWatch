// Reader homepage — "All AI Dynamics" with server-side search + filtering (Slice 5).
// (reader) is a route group, so this renders at "/". Filters live in the URL (URL-as-state),
// resolved server-side via parsePublicQuery, then fetched with searchEvents. Dynamic: it reads
// the DB per request and degrades to a setup hint if the DB isn't reachable yet.
//
// Slice 8: hydrates the viewer's reaction state (liked/starred per event) using either
// the session user id or the signed `rid` cookie that middleware planted on first visit.

import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { searchEvents, type EventCard as EventCardData } from "@/db/queries/feed";
import { getViewerReactions } from "@/db/queries/reactions";
import { messages } from "@/i18n";
import { parsePublicQuery, type PublicQuery } from "@/public/query";
import { EventCard } from "./event-card";
import { SearchBar } from "./search-bar";

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
  const reactions = await loadViewerReactions(events.map((e) => e.id));
  const m = messages;
  const isFiltered = Boolean(query.q || query.tags?.length || query.level || query.mode === "selected");

  return (
    <main className="page">
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
          {events.map((event) => {
            const r = reactions.get(event.id) ?? { liked: false, starred: false };
            return <EventCard key={event.id} event={event} liked={r.liked} starred={r.starred} />;
          })}
        </div>
      )}

      <p className="note">{m.card.summaryNote}</p>
    </main>
  );
}
