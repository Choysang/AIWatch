// Route-level loading UI: skeleton cards that mirror the feed layout so the page
// doesn't flash blank text while the server renders. Pure CSS shimmer (respects
// prefers-reduced-motion in globals.css).

const SKELETON_CARD_COUNT = 4;

function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-line skeleton-meta" />
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-text" />
      <div className="skeleton-line skeleton-text short" />
      <div className="skeleton-footer">
        <div className="skeleton-line skeleton-chip" />
        <div className="skeleton-line skeleton-chip" />
        <div className="skeleton-line skeleton-chip" />
      </div>
    </div>
  );
}

export default function ReaderLoading() {
  return (
    <main className="page">
      <div className="skeleton-feed" role="status" aria-live="polite" aria-label="正在加载">
        <div className="skeleton-line skeleton-heading" />
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </main>
  );
}
