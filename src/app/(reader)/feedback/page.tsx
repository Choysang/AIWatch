// Reader feedback page. Server shell (owns metadata) + a client form island. Renders at
// "/feedback". Anonymous submissions allowed; the form POSTs to /api/feedback.

import { SubpageNav } from "@/app/subpage-nav";
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
        <SubpageNav />
      </header>

      <div className="form-page-shell">
        <p className="section-intro">{m.subheading}</p>
        <FeedbackForm />
      </div>
    </main>
  );
}
