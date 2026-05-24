// Reader homepage — "All AI Dynamics" in time order (spec: Information Architecture).
// (reader) is a route group, so this renders at "/". Dynamic: it reads the DB per
// request and degrades to a setup hint if the DB isn't reachable yet.

import Link from "next/link";
import { listRecentEvents, type EventCard as EventCardData } from "@/db/queries/feed";
import { messages } from "@/i18n";
import { EventCard } from "./event-card";

export const dynamic = "force-dynamic";

async function loadEvents(): Promise<{ events: EventCardData[]; error: boolean }> {
  try {
    return { events: await listRecentEvents(30), error: false };
  } catch {
    // No DB yet (fresh clone before migrate/seed) — show the setup hint, don't crash.
    return { events: [], error: true };
  }
}

export default async function HomePage() {
  const { events } = await loadEvents();
  const m = messages;

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

      {events.length === 0 ? (
        <div className="empty">{m.home.empty}</div>
      ) : (
        <div className="feed">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      <p className="note">{m.card.summaryNote}</p>
    </main>
  );
}
