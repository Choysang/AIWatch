// Reader changelog — "what changed and why", rendered from static data (no DB). Renders at
// "/changelog". Newest first, with a type badge per entry. This is the public, plain-language
// record of reader-visible changes to the skeleton.

import { SubpageNav } from "@/app/subpage-nav";
import { CHANGELOG } from "@/content/changelog";
import { formatDayHeading } from "@/app/_lib/format";
import { messages } from "@/i18n";

export const metadata = {
  title: `${messages.nav.changelog} · ${messages.appName}`,
  description: messages.changelog.subheading,
};

// Noon UTC keeps the APP_TZ-rendered day stable regardless of the runtime timezone.
function dayHeadingForDate(date: string): string {
  return formatDayHeading(new Date(`${date}T04:00:00Z`));
}

export default function ChangelogPage() {
  const m = messages.changelog;

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <SubpageNav />
      </header>

      <p className="section-intro">{m.subheading}</p>

      {CHANGELOG.length === 0 ? (
        <div className="empty">{m.empty}</div>
      ) : (
        <ol className="changelog">
          {CHANGELOG.map((entry) => (
            <li className="changelog-entry" key={`${entry.date}-${entry.title}`}>
              <div className="changelog-meta">
                <time className="changelog-date">{dayHeadingForDate(entry.date)}</time>
                <span className={`changelog-badge ${entry.type}`}>{m.type[entry.type]}</span>
              </div>
              <h2 className="changelog-title">{entry.title}</h2>
              {entry.body.map((para) => (
                <p className="changelog-body" key={para}>
                  {para}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
