"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

export interface SidebarEventItem {
  id: string;
  title: string;
  sourceName: string | null;
  when: string;
  selectedLabel: string | null;
  viewCount: number;
}

function scrollToEventCard(eventId: string) {
  const revealTarget = () => {
    const target = document.getElementById(`event-${eventId}`);
    if (!target || target.getClientRects().length === 0) return false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "auto", block: "center" });
    return true;
  };

  window.dispatchEvent(new CustomEvent("aiwatch:reveal-event-card", { detail: { eventId } }));
  if (revealTarget()) return;
  window.requestAnimationFrame(revealTarget);
}

export function ReaderSidebar({ items }: { items: SidebarEventItem[] }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(264);

  useEffect(() => {
    setOpen(window.innerWidth >= 1180);
  }, []);

  // 点8：速览栏与左侧导航一致 — 展开时占据布局空间（中间内容自适应收缩），
  // 而不是浮层盖住卡片。预留宽度通过根上的 CSS 变量传给 .page.reader-home。
  useEffect(() => {
    const reserve = open ? `${width + 16}px` : "0px";
    document.documentElement.style.setProperty("--reader-sidebar-reserve", reserve);
    return () => {
      document.documentElement.style.removeProperty("--reader-sidebar-reserve");
    };
  }, [open, width]);

  const startResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: PointerEvent) => {
      setWidth(Math.min(380, Math.max(220, startWidth + startX - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const openEventFromOverview = (eventId: string) => {
    scrollToEventCard(eventId);
    if (window.innerWidth <= 760) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="reader-sidebar-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "收起侧栏" : "资讯速览"}
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
          <div className="reader-sidebar-head">
            <h2>资讯速览</h2>
            <button
              type="button"
              className="reader-sidebar-close"
              aria-label="收起资讯速览"
              onClick={() => setOpen(false)}
            >
              收起
            </button>
          </div>
          {items.length === 0 ? (
            <p className="reader-sidebar-muted">当前筛选下暂无动态。</p>
          ) : (
            <ol className="reader-sidebar-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="reader-sidebar-jump"
                    onClick={() => openEventFromOverview(item.id)}
                  >
                    {item.title}
                  </button>
                  <div className="reader-sidebar-meta">
                    {item.sourceName ?? "未知来源"} · {item.when} · 浏览 {item.viewCount}
                    {item.selectedLabel ? ` · ${item.selectedLabel}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </>
  );
}
