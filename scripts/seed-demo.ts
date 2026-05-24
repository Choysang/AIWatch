// `bun run db:seed:demo` — load offline demo data (decision 15). Inserts a few mock
// sources and runs the REAL event-formation pipeline (MockConnector + StubLLMProvider)
// so the demo exercises the same gate -> judge -> score -> event path the worker uses.
// Idempotent: fixed source ids + canonical-URL dedup mean re-running is safe.

import { MockConnector } from "@/connectors/mock";
import { db, pool } from "@/db/client";
import { checkPromotion } from "@/db/jobs/check-promotion";
import type { DueSource } from "@/db/queries/sources";
import { sources } from "@/db/schema";
import { processSource } from "@/pipeline/process-source";

interface DemoSource {
  id: string;
  name: string;
  platform: DueSource["platform"];
  level: DueSource["level"];
  sourceType: "official" | "community";
  url: string;
}

const DEMO_SOURCES: DemoSource[] = [
  { id: "src_demo_openai", name: "OpenAI Blog", platform: "blog", level: "L1", sourceType: "official", url: "https://openai.com/blog" },
  { id: "src_demo_anthropic", name: "Anthropic News", platform: "blog", level: "L1", sourceType: "official", url: "https://www.anthropic.com/news" },
  { id: "src_demo_hn", name: "Hacker News (AI)", platform: "hackernews", level: "L3", sourceType: "community", url: "https://news.ycombinator.com" },
];

async function main(): Promise<void> {
  const connector = new MockConnector();
  for (const s of DEMO_SOURCES) {
    await db
      .insert(sources)
      .values({
        id: s.id,
        name: s.name,
        platform: s.platform,
        level: s.level,
        sourceType: s.sourceType,
        connectorType: "mock",
        url: s.url,
      })
      .onConflictDoNothing({ target: sources.id });

    const due: DueSource = {
      id: s.id,
      platform: s.platform,
      connectorType: "mock",
      connectorRef: null,
      url: s.url,
      handle: null,
      level: s.level,
    };
    const summary = await processSource(due, await connector.fetch(due));
    // eslint-disable-next-line no-console -- script output
    console.log(`[seed] ${s.name}:`, summary);
  }

  // Run the B/A/S tournament so the demo homepage shows real selected badges.
  const promotion = await checkPromotion();
  // eslint-disable-next-line no-console -- script output
  console.log("[seed] promotion:", promotion);
  // eslint-disable-next-line no-console -- script output
  console.log("[seed] demo data ready. Start the app: bun run dev");
  await pool.end();
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- fatal
  console.error("[seed] failed:", error);
  process.exit(1);
});
