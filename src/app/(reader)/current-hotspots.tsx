import type { CurrentHotspot } from "@/db/queries/current-hotspots";
import { formatRelativeTime } from "@/app/_lib/format";

export function CurrentHotspots({ items }: { items: CurrentHotspot[] }) {
  return (
    <section className="current-hotspots" aria-labelledby="current-hotspots-title">
      <div className="current-hotspots-head">
        <h2 id="current-hotspots-title">
          <span className="current-hotspots-flame" aria-hidden="true" />
          当前热点
        </h2>
        <p>24 小时关键词 · 官方事件优先</p>
      </div>

      {items.length === 0 ? (
        <p className="current-hotspots-empty">暂无达到多信源阈值的热点，先看最新动态。</p>
      ) : (
        <ol className="current-hotspots-list">
          {items.map((item, index) => (
            <li className="current-hotspots-item" key={item.id}>
              <a
                className="current-hotspots-title"
                href={`/events/${item.id}`}
                data-tooltip="打开该热点的站内详情页"
              >
                <span className="current-hotspots-rank">{index + 1}</span>
                <span>{item.title}</span>
              </a>
              <span className="current-hotspots-meta">
                {item.keywords.length > 0 && (
                  <>
                    <span>{item.keywords.slice(0, 2).join(" / ")}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>{item.mentionCount} 次提及</span>
                <span aria-hidden="true">·</span>
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
