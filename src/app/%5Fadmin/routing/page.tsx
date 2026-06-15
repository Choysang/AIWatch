// Model-routing admin page (v0.5 C1). Lists every LLM task with its effective provider/model
// (static/env base, or the DB override), each provider's key status, and the price — and lets
// an admin override provider+model per task. The web process reads overrides straight from the
// DB here (its in-memory cache is never primed — that's the worker's); the worker applies the
// change on its next refresh cron. Unlinked from public nav; admin role required.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isAdminRole } from "@/app/_lib/session";
import { listRoutingOverrides } from "@/db/queries/routing-overrides";
import { messages } from "@/i18n";
import { getPrice } from "@/llm/pricing";
import { LLM_TASKS, llmRouting, PROVIDERS, providerConfigured } from "@/llm/routing";
import { RoutingEditor, type ProviderOption, type RoutingRow } from "./routing-editor";

export const metadata = {
  title: `${messages.admin.routing.title} · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RoutingAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/_admin/routing");
  const role = (session.user as { role?: string }).role;
  if (!isAdminRole(role)) {
    return (
      <main className="page admin-page">
        <p>{messages.admin.loginRequired}</p>
      </main>
    );
  }

  const overrides = new Map((await listRoutingOverrides()).map((o) => [o.task, o]));
  const rows: RoutingRow[] = LLM_TASKS.map((task) => {
    const base = llmRouting[task];
    const override = overrides.get(task);
    const provider = override?.provider ?? base.provider;
    const model = override?.model ?? base.model;
    const price = getPrice(provider as never, model);
    return {
      task,
      provider,
      model,
      overridden: Boolean(override),
      providerHasKey: providerConfigured(provider as never),
      priceLabel: price ? `$${price.inputUsdPer1m} / $${price.outputUsdPer1m}` : null,
    };
  });

  // Exclude stub from the picker — routing a prod task to stub is a footgun.
  const providers: ProviderOption[] = PROVIDERS.filter((p) => p !== "stub").map((p) => ({
    name: p,
    hasKey: providerConfigured(p),
  }));

  return (
    <main className="page admin-page">
      <header className="masthead">
        <h1 style={{ fontSize: "1.8rem" }}>{messages.admin.routing.title}</h1>
        <nav>
          <span className="tagline">
            <Link href="/_admin">← {messages.admin.title}</Link>
          </span>
        </nav>
      </header>
      <p className="section-intro">{messages.admin.routing.subheading}</p>
      <RoutingEditor rows={rows} providers={providers} />
    </main>
  );
}
