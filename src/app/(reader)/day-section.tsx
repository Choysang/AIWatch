// Collapsible day group for the feed. The date header sticks to the top while scrolling
// so the reader always knows which day they're in; the toggle collapses an already-read
// day. Server-rendered EventCards arrive as `children` (the RSC-as-children pattern), so
// this client island only owns the open/closed state — no event data crosses the boundary.

"use client";

import { useState } from "react";

interface DaySectionProps {
  heading: string;
  count: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function DaySection({ heading, count, children, defaultCollapsed = false }: DaySectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="day-group">
      <header className="day-header">
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
      {/* Kept mounted and hidden (not unmounted) so collapsing doesn't drop client island
          state inside the cards, and re-expanding is instant. */}
      <div className="day-items" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
