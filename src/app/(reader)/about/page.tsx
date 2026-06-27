// Reader "about" jump page. Static (no DB). Renders at "/about" and points readers to
// feedback/contribution, README context, and the public broadcast Skill.

import Link from "next/link";
import { SubpageNav } from "@/app/subpage-nav";
import { messages } from "@/i18n";

const GITHUB_URL = "https://github.com/Choysang/AIWatch";
const SITE_URL = "https://aiwatch.icu";

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
        <SubpageNav />
      </header>

      <article className="about">
        <div className="about-copy">
          <p className="about-intro">{m.intro}</p>
          {m.paragraphs.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>

        <div className="about-jump-grid" aria-label="快速上手">
          <section className="about-jump-card">
            <h2>怎么阅读</h2>
            <p>先看左侧“每日速览”的今日阅读路径，再读今日头条、值得关注和昨日追踪；需要完整上下文时点进站内详情页。</p>
            <p>首页按时间展示全部动态，精选会更克制：宁愿少一些，也优先保留能帮助判断、实践或理解行业方向的内容。</p>
          </section>

          <section className="about-jump-card">
            <h2>主要功能</h2>
            <p>内容广场负责浏览和筛选；每日速览沉淀日、周、月报；主题板按标签和信源形成个人观察面；我的互动保存点赞、收藏、评论和主理人反馈。</p>
            <p>RSS 和公开 API 面向阅读器与自动化流程，提供站内永久链接、摘要、正文和原始出处。</p>
          </section>

          <section className="about-jump-card">
            <h2>组件思路</h2>
            <p>卡片回答“发生了什么”和“为什么值得看”；质量分帮助快速扫读；标签用于二次过滤；详情页保留中文摘要、富文本正文、原文入口和讨论。</p>
            <p>筛选里的“信源类型”目前聚焦官方、行业领袖、技术分享三类高信号来源；更细的媒体、社区、平台类入口会在信源审核层继续补齐。</p>
          </section>
        </div>

        <div className="about-jump-grid" aria-label="关于 AIWatch">
          <section className="about-jump-card">
            <h2>反馈与贡献</h2>
            <p>反馈用于改进当前网页体验；信源推荐会进入后台审核，通过后才会接入抓取。</p>
            <div className="about-jump-links">
              <Link href="/feedback">提交网站反馈</Link>
              <Link href="/recommend-source">推荐信源</Link>
            </div>
          </section>

          <section className="about-jump-card">
            <h2>README</h2>
            <p>查看项目定位、公开边界和代码仓库；AIWatch 的真实信源库与事件库属于运营资产。</p>
            <div className="about-jump-links">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub 仓库
              </a>
              <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
                在线部署
              </a>
            </div>
          </section>

          <section className="about-jump-card">
            <h2>播报 Skill</h2>
            <p>把 AIWatch 接入个人播报流程，按内容范围、排除规则、输出深度和投递方式生成长期播报。</p>
            <div className="about-jump-links">
              <Link href="/aiwatch-skill">查看 Skill</Link>
              <a href="/aiwatch-skill/SKILL.md">下载 SKILL.md</a>
            </div>
          </section>
        </div>

        <p className="note">{m.openSourceNote}</p>
      </article>
    </main>
  );
}
