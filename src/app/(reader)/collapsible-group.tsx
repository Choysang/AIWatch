// 四层通用折叠分组（年/月/周/日）。由 DaySection 泛化而来：只持有 open/closed 本地状态，
// 服务端渲染的子内容以 children 传入（RSC-as-children），事件数据不跨客户端边界。
// 折叠时用 hidden 隐藏而非卸载，保留卡片内客户端岛（点赞/收藏）状态。

"use client";

import { useState } from "react";

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
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isDay = level === "day";

  return (
    <section className={`tl-group tl-group--${level}${isDay ? " day-group" : ""}`}>
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
