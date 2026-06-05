"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { TrackableDetailLink } from "./event-view-tracker";

export interface SidebarEventItem {
  id: string;
  title: string;
  sourceName: string | null;
  when: string;
  selectedLabel: string | null;
  viewCount: number;
}

const GITHUB_URL = "https://github.com/Choysang/AIWatch";
const SITE_URL = "https://aiwatch.icu";

export function ReaderSidebar({ items }: { items: SidebarEventItem[] }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(340);

  useEffect(() => {
    setOpen(window.innerWidth >= 1180);
  }, []);

  const startResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: PointerEvent) => {
      setWidth(Math.min(520, Math.max(280, startWidth + startX - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <button
        type="button"
        className="reader-sidebar-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "收起侧栏" : "打开侧栏"}
      </button>
      <aside
        className={`reader-sidebar ${open ? "is-open" : ""}`}
        style={{ "--reader-sidebar-width": `${width}px` } as CSSProperties}
        aria-label="AIWatch 辅助侧栏"
      >
        <button
          type="button"
          className="reader-sidebar-resize"
          aria-label="拖动调整侧栏宽度"
          onPointerDown={startResize}
        />

        <section>
          <h2>当前资讯</h2>
          {items.length === 0 ? (
            <p className="reader-sidebar-muted">当前筛选下暂无动态。</p>
          ) : (
            <ol className="reader-sidebar-list">
              {items.map((item) => (
                <li key={item.id}>
                  <TrackableDetailLink eventId={item.id} href={`/events/${item.id}`}>
                    {item.title}
                  </TrackableDetailLink>
                  <div className="reader-sidebar-meta">
                    {item.sourceName ?? "未知来源"} · {item.when} · 浏览 {item.viewCount}
                    {item.selectedLabel ? ` · ${item.selectedLabel}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2>反馈与贡献</h2>
          <div className="reader-sidebar-actions">
            <Link href="/feedback">提交网站反馈</Link>
            <Link href="/recommend-source">推荐信源</Link>
          </div>
          <p className="reader-sidebar-muted">
            反馈用于改进当前网页体验；信源推荐会进入后台审核，通过后才会接入抓取。
          </p>
        </section>

        <section>
          <h2>README</h2>
          <p>
            AIWatch 是一个中文 AI 热点系统：信源抓取、LLM 结构化判断、确定性评分晋级、网页阅读和公共 Skill。
          </p>
          <div className="reader-sidebar-actions">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub 仓库
            </a>
            <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
              在线部署
            </a>
            <Link href="/about">项目简介</Link>
          </div>
        </section>

        <section>
          <h2>播报 Skill</h2>
          <p>
            可以把 AIWatch 做成个人播报源。让 Agent 先问清楚：最想看什么、不想看什么、整理深度、播报时间、保存位置，以及是否发送到邮箱或短信。
          </p>
          <ul className="reader-sidebar-checklist">
            <li>内容范围：模型、产品、技术、讨论或指定关键词。</li>
            <li>排除规则：营销、重复转述、低质量讨论、非中文摘要。</li>
            <li>输出形式：3 条快报、完整简报、日报、周报。</li>
            <li>投递方式：文件路径、邮箱、短信或仅在对话中播报。</li>
          </ul>
          <div className="reader-sidebar-actions">
            <Link href="/aiwatch-skill">查看 Skill</Link>
            <a href="/aiwatch-skill/SKILL.md">下载 SKILL.md</a>
          </div>
        </section>
      </aside>
    </>
  );
}
