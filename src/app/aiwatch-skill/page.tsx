// Public install page for the aiwatch-hot Skill (decision 13). Static; links to SKILL.md
// and shows the few read endpoints. No feed data here.

import { messages } from "@/i18n";

export const metadata = {
  title: `${messages.appName} Skill · aiwatch-hot`,
};

export default function SkillInstallPage() {
  return (
    <main className="page">
      <header className="masthead">
        <h1 style={{ fontFamily: "var(--font-serif)" }}>aiwatch-hot</h1>
        <span className="tagline">{messages.appName} 公共 Skill</span>
      </header>

      <p className="section-intro">
        让你的 Agent 直接查询 AIWatch 的 AI 精选。只读、无需 API key。触发词：AIWatch、AI
        热点、AI 日报、AI 精选、AI 动态。
      </p>

      <div className="card">
        <h2 style={{ fontFamily: "var(--font-serif)" }}>安装</h2>
        <p className="summary">
          将下面的 Skill 文件交给你的 Agent（Claude Code / 兼容 Agent）：
        </p>
        <p>
          <a href="/aiwatch-skill/SKILL.md">
            <code>/aiwatch-skill/SKILL.md</code>
          </a>
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ fontFamily: "var(--font-serif)" }}>只读端点</h2>
        <ul>
          <li>
            <code>GET /api/public/items?mode=selected&amp;since=today</code>：今日精选
          </li>
          <li>
            <code>GET /api/public/items?mode=selected&amp;since=week</code>：本周精选
          </li>
          <li>
            <code>GET /api/public/items?mode=selected&amp;since=month</code>：本月精选
          </li>
          <li>
            <code>GET /api/public/items?q=关键词</code>：关键词搜索（服务端）
          </li>
          <li>
            <code>GET /api/public/items?mode=all</code>：全部动态（按时间）
          </li>
          <li>
            <code>GET /api/public/daily</code>：最新 AI 日报（含三节正文）
          </li>
          <li>
            <code>GET /api/public/dailies?take=N</code>：近期日报列表
          </li>
        </ul>
        <p className="note" style={{ border: 0, margin: 0 }}>
          摘要由 LLM 生成，请以 <code>url</code> 原文为权威来源。
        </p>
      </div>
    </main>
  );
}
