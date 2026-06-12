// 四层通用折叠分组（年/月/周/日）。由 DaySection 泛化而来：只持有 open/closed 本地状态，
// 服务端渲染的子内容以 children 传入（RSC-as-children），事件数据不跨客户端边界。
// 折叠时用 hidden 隐藏而非卸载，保留卡片内客户端岛（点赞/收藏）状态。

"use client";

import { useEffect, useRef, useState } from "react";

export type TimelineLevel = "year" | "month" | "week" | "day";

interface CollapsibleGroupProps {
  level: TimelineLevel;
  heading: string;
  count: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function CollapsibleGroup({
  level,
  heading,
  count,
  children,
  defaultCollapsed = false,
}: CollapsibleGroupProps) {
  const groupRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isDay = level === "day";

  useEffect(() => {
    const revealEventCard = (event: Event) => {
      const eventId = (event as CustomEvent<{ eventId?: string }>).detail?.eventId;
      if (!eventId) return;
      const cards = groupRef.current?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [];
      if ([...cards].some((card) => card.dataset.eventId === eventId)) setCollapsed(false);
    };
    window.addEventListener("aiwatch:reveal-event-card", revealEventCard);
    return () => window.removeEventListener("aiwatch:reveal-event-card", revealEventCard);
  }, []);

  return (
    <section ref={groupRef} className={`tl-group tl-group--${level}${isDay ? " day-group" : ""}`}>
      <header className={`tl-group-header${isDay ? " day-header" : ""}`}>
        <button
          type="button"
          className="day-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="day-caret" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="day-date">{heading}</span>
          <span className="day-count">{count}</span>
        </button>
      </header>
      <div className={`tl-group-body${isDay ? " day-items" : ""}`} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
