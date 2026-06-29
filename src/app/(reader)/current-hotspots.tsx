import type { CurrentHotspot } from "@/db/queries/current-hotspots";
import { formatRelativeTime } from "@/app/_lib/format";
import { CurrentHotspotJump } from "./current-hotspot-jump";

export function CurrentHotspots({ items }: { items: CurrentHotspot[] }) {
  return (
    <section className="current-hotspots" aria-labelledby="current-hotspots-title">
      <div className="current-hotspots-head">
        <h2 id="current-hotspots-title">
          <span className="current-hotspots-flame" aria-hidden="true" />
          当前热点
        </h2>
        <p>多信源热度 · 随时间消退</p>
      </div>

      {items.length === 0 ? (
        <p className="current-hotspots-empty">暂无达到多信源阈值的热点，先看最新动态。</p>
      ) : (
        <ol className="current-hotspots-list">
          {items.map((item, index) => (
            <li className="current-hotspots-item" key={item.id}>
              <CurrentHotspotJump eventId={item.id} rank={index + 1} title={item.title} />
              <span className="current-hotspots-meta">
                <button
                  type="button"
                  className="current-hotspots-source-trigger"
                  aria-label={`${item.sourceCount} 个信源：${item.sourceNames.join(" / ")}`}
                >
                  {item.sourceCount} 个信源
                  <span className="current-hotspots-source-list" role="tooltip">
                    {item.sourceNames.join(" / ")}
                  </span>
                </button>
                <span aria-hidden="true">·</span>
                <time dateTime={item.lastSeenAt.toISOString()}>{formatRelativeTime(item.lastSeenAt)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
