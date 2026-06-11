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
