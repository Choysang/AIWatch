// 我的主题板 (v0.5 A1): reader-owned topic boards. A board is a named set of tags; opening
// one drops the reader into the home feed pre-filtered to those tags (/?tags=...), so the
// fully-featured timeline is reused with zero duplication. Boards are owned by the rid
// cookie (anonymous, device-local) or the account when logged in.
//
// SSR is best-effort: on a reader's first-ever visit the rid cookie hasn't round-tripped
// yet, so listBoards returns empty — correct (no boards yet). The client manager owns
// mutations and keeps its list authoritative from the API responses afterward.

import { resolveReaderIdentityServer } from "@/app/_lib/reader-identity";
import { SubpageNav } from "@/app/subpage-nav";
import { listBoards, type TopicBoard } from "@/db/queries/topic-boards";
import { listSourceOptions, type SourceOption } from "@/db/queries/sources";
import { listPopularTags } from "@/db/queries/tags";
import { messages } from "@/i18n";
import { log } from "@/log";
import { BoardManager } from "./board-manager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.boards.heading} · ${messages.appName}`,
  description: messages.boards.subheading,
};

function warn(label: string, error: unknown): void {
  log.warn(label, { message: error instanceof Error ? error.message : String(error) });
}

async function loadInitialBoards(): Promise<TopicBoard[]> {
  try {
    const identity = await resolveReaderIdentityServer();
    if (!identity) return [];
    return await listBoards(identity);
  } catch (error) {
    warn("[reader] loadInitialBoards failed", error);
    return [];
  }
}

async function loadPopularTags(): Promise<string[]> {
  try {
    return (await listPopularTags(40)).map((t) => t.tag);
  } catch (error) {
    warn("[reader] loadPopularTags failed", error);
    return [];
  }
}

async function loadSourceOptions(): Promise<SourceOption[]> {
  try {
    return await listSourceOptions();
  } catch (error) {
    warn("[reader] loadSourceOptions failed", error);
    return [];
  }
}

export default async function BoardsPage() {
  const m = messages.boards;
  const [initialBoards, popularTags, sourceOptions] = await Promise.all([
    loadInitialBoards(),
    loadPopularTags(),
    loadSourceOptions(),
  ]);

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <SubpageNav />
      </header>

      <p className="section-intro">{m.subheading}</p>
      <section className="about-jump-card" aria-label="主题板使用说明">
        <h2>主题板怎么用</h2>
        <p>
          主题板用于把关注的标签和信源放在一起。打开某个主题板后，首页会按“命中标签或命中信源”筛选动态，适合做 Agent、模型、公司或研究方向的长期观察。
        </p>
        <p>
          信源导入默认使用通用 OPML 2.0。每个 <code>outline</code> 至少保留 <code>text</code> 和{" "}
          <code>xmlUrl</code>；<code>htmlUrl</code> 可选，用于展示原站。
        </p>
        <pre className="code-block">
          {`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="OpenAI Blog" type="rss" xmlUrl="https://openai.com/news/rss.xml" htmlUrl="https://openai.com/news/" />
    <outline text="Anthropic News" type="rss" xmlUrl="https://www.anthropic.com/news/rss.xml" htmlUrl="https://www.anthropic.com/news" />
  </body>
</opml>`}
        </pre>
      </section>
      <BoardManager
        initialBoards={initialBoards}
        popularTags={popularTags}
        sourceOptions={sourceOptions}
      />
    </main>
  );
}
