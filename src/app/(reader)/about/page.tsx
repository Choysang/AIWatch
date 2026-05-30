// Reader "about" page — who/what this is, in plain language. Static (no DB). Renders at
// "/about". Letter-style intro plus the project's guiding principles, ending with the
// open-source data-boundary note.

import Link from "next/link";
import { messages } from "@/i18n";

export const metadata = {
  title: `${messages.about.heading} · ${messages.appName}`,
  description: messages.about.intro,
};

export default function AboutPage() {
  const m = messages.about;

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <Link href="/" className="tagline">
          {messages.nav.dynamics}
        </Link>
      </header>

      <article className="about">
        <p className="about-intro">{m.intro}</p>
        {m.paragraphs.map((para) => (
          <p key={para}>{para}</p>
        ))}
        <p className="note">{m.openSourceNote}</p>
        <p>
          <Link href="/feedback" className="about-cta">
            {messages.nav.feedback} →
          </Link>
        </p>
      </article>
    </main>
  );
}
