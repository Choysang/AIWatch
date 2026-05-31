// Thin client wrapper that turns a server-rendered EventCard into a Bento cell with a
// mouse-following spotlight glow tinted by the card's model accent. The server card arrives
// as `children` (RSC-as-children pattern) so no event data crosses the client boundary —
// this island only tracks the cursor position as CSS custom props (--mx/--my), updated by
// direct style writes (no React re-render per mousemove). The glow color comes from
// --card-accent, set once from the server-derived accent.

"use client";

import { useRef } from "react";

interface SpotlightCardProps {
  /** RGB channels ("R G B") for the spotlight tint. */
  accentRgb: string;
  /** Visual weight on the timeline: "featured" | "standard" | "compact". */
  emphasis: string;
  children: React.ReactNode;
}

export function SpotlightCard({ accentRgb, emphasis, children }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      className={`bento-cell tl-${emphasis}`}
      style={{ "--card-accent": accentRgb } as React.CSSProperties}
      onMouseMove={onMouseMove}
    >
      {children}
      <span className="spotlight" aria-hidden="true" />
    </div>
  );
}
