// Public install page for the AI HOT Skill, RSS feeds, and anonymous public API.

import Link from "next/link";
import { messages } from "@/i18n";
import { SubpageNav } from "@/app/subpage-nav";

export const metadata = {
  title: `${messages.appName} Agent 接入`,
};

const TRIGGERS = [
  "今天 AI 圈有什么新东西",
  "看一下今天的 AI 日报",
  "最近 OpenAI 有什么发布",
  "看下精选条目",
  "最近一周的 AI 论文",
  "AI 模型发布列表",
  "最近 3 天 AI 行业动态",
  "AI 圈昨天发生了什么",
];

export default function SkillInstallPage() {
  return (
    <main className="page access-page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>AI HOT Agent 接入</h1>
          <span className="tagline">Skill · RSS · REST API · OpenAPI</span>
        </div>
        <SubpageNav />
      </header>

      <p className="section-intro">
        让 Claude Code、Codex CLI、Cursor、Gemini CLI、GitHub Copilot、OpenCode、Cline、Windsurf
        或任意 Agent 直接读取 AI HOT 的精选动态、全部 AI 动态和每日精编日报。匿名免费，无需 token。
      </p>

      <section className="card access-card">
        <h2 style={{ fontFamily: "var(--font-serif)" }}>一行安装 Skill</h2>
        <p className="summary">
          在你的 Agent 里直接发这句话，Agent 会自己装到对应目录：
        </p>
        <pre className="access-command">帮我安装这个 skill：https://aiwatch.icu/aiwatch-skill/</pre>
        <p>
          <Link href="/aiwatch-skill/SKILL.md">
            <code>/aiwatch-skill/SKILL.md</code>
          </Link>
        </p>
      </section>

      <section className="card access-card">
        <h2 style={{ fontFamily: "var(--font-serif)" }}>触发示例</h2>
        <div className="access-chip-grid">
          {TRIGGERS.map((text) => (
            <span className="tag" key={text}>
              {text}
            </span>
          ))}
        </div>
      </section>

      <section className="card access-card">
        <h2 style={{ fontFamily: "var(--font-serif)" }}>Skill 会怎么分流</h2>
        <dl className="access-routes">
          <div>
            <dt>默认宽问题</dt>
            <dd>
              <code>GET /api/public/items?mode=selected&amp;since=...</code>
            </dd>
          </div>
          <div>
            <dt>明确说日报</dt>
            <dd>
              <code>GET /api/public/daily</code> 或 <code>/api/public/daily/YYYY-MM-DD</code>
            </dd>
          </div>
          <div>
            <dt>明确要全部 / 全量</dt>
            <dd>
              <code>GET /api/public/items?mode=all&amp;since=all</code>
            </dd>
          </div>
          <div>
            <dt>关键词搜索</dt>
            <dd>
              <code>GET /api/public/items?q=OpenAI</code>，服务端搜索，不本地抓全量 grep
            </dd>
          </div>
          <div>
            <dt>日报归档</dt>
            <dd>
              <code>GET /api/public/dailies?take=30</code>
            </dd>
          </div>
        </dl>
      </section>

      <section className="card access-card">
        <h2 style={{ fontFamily: "var(--font-serif)" }}>RSS 订阅</h2>
        <ul className="access-list">
          <li>
            <strong>精选</strong>
            <Link href="/feed.xml">https://aiwatch.icu/feed.xml</Link>
          </li>
          <li>
            <strong>全部 AI 动态</strong>
            <Link href="/feed/all.xml">https://aiwatch.icu/feed/all.xml</Link>
          </li>
          <li>
            <strong>AI HOT 日报</strong>
            <Link href="/feed/daily.xml">https://aiwatch.icu/feed/daily.xml</Link>
          </li>
        </ul>
      </section>

      <section className="card access-card">
        <h2 style={{ fontFamily: "var(--font-serif)" }}>开发者 API</h2>
        <p className="summary">
          公共 REST API 匿名只读，只暴露浏览器里也能看到的最终内容字段。严格 schema 可读取 OpenAPI 3.1。
        </p>
        <p>
          <Link href="/openapi.yaml">
            <code>/openapi.yaml</code>
          </Link>
        </p>
      </section>

      <p className="note">
        摘要由 LLM 生成，请以原文为准。测试版如遇滥用或服务器压力，接口可能临时限流或调整。
      </p>
    </main>
  );
}
