// Reader source recommendation page. Public users submit candidate sources for admin
// review; nothing is connected until an operator approves it in /_admin.

import { SubpageNav } from "@/app/subpage-nav";
import { messages } from "@/i18n";
import { SourceRecommendationForm } from "./source-recommendation-form";

export const metadata = {
  title: `${messages.nav.recommendSource} · ${messages.appName}`,
  description: messages.sourceRecommendation.subheading,
};

export default function RecommendSourcePage() {
  const m = messages.sourceRecommendation;

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <SubpageNav />
      </header>

      <p className="section-intro">{m.subheading}</p>
      <SourceRecommendationForm />
    </main>
  );
}
