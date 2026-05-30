// Reader feedback page. Server shell (owns metadata) + a client form island. Renders at
// "/feedback". Anonymous submissions allowed; the form POSTs to /api/feedback.

import Link from "next/link";
import { messages } from "@/i18n";
import { FeedbackForm } from "./feedback-form";

export const metadata = {
  title: `${messages.nav.feedback} · ${messages.appName}`,
  description: messages.feedback.subheading,
};

export default function FeedbackPage() {
  const m = messages.feedback;

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

      <p className="section-intro">{m.subheading}</p>
      <FeedbackForm />
    </main>
  );
}
