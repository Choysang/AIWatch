"use client";

interface CurrentHotspotJumpProps {
  eventId: string;
  rank: number;
  title: string;
}

function revealEventCard(eventId: string): boolean {
  const target = document.getElementById(`event-${eventId}`);
  if (!target || target.getClientRects().length === 0) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: "auto", block: "center" });
  return true;
}

export function CurrentHotspotJump({ eventId, rank, title }: CurrentHotspotJumpProps) {
  return (
    <a
      className="current-hotspots-title"
      href={`#event-${eventId}`}
      onClick={(event) => {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("aiwatch:reveal-event-card", {
            detail: { eventId },
          }),
        );
        if (!revealEventCard(eventId)) window.requestAnimationFrame(() => revealEventCard(eventId));
      }}
    >
      <span className="current-hotspots-rank">{rank}</span>
      <span>{title}</span>
    </a>
  );
}
