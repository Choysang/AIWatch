// Presentational event card (spec: UI Content Card). Pure render from an EventCard;
// no data loading here. Answers "what happened?" (summary) and "why care?" (reason).
// Slice 8: hosts the ReactionButtons client island (likes/stars). The viewer's reacted
// state arrives as props from the SSR page so the first render isn't shifted by a
// client-side fetch.

import type { EventCard as EventCardData } from "@/db/queries/feed";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { extractCardMediaGallery, proxiedImageUrl } from "@/app/_lib/media";
import { AnnotationButtons, type OwnerVerdict } from "./annotation-buttons";
import { CommentTicker } from "./comment-ticker";
import { EventCardShell, TrackableDetailLink, TrackableOriginalLink } from "./event-view-tracker";
import { InlineComments } from "./inline-comments";
import { ReactionButtons } from "./reaction-buttons";
import { ImageLightbox } from "./image-lightbox";

const MAX_TAGS = 4;

type EventCategoryKey = keyof typeof messages.search.eventCategory;

/** Reader-facing label for the article's public category. */
function eventCategoryLabel(category: string | null): string | null {
  if (!category || !(category in messages.search.eventCategory)) return null;
  return messages.search.eventCategory[category as EventCategoryKey];
}

function mediaPreviewUrl(item: { type: "image"; url: string } | { type: "video"; url: string; poster?: string }): string | null {
  return item.type === "image" ? item.url : item.poster ?? null;
}

interface EventCardProps {
  event: EventCardData;
  liked?: boolean;
  starred?: boolean;
  downed?: boolean;
  /** Monospace brand tag (e.g. "DEEPSEEK") for the reader-home Bento treatment. */
  accentLabel?: string;
  /** Top reader comments for the rotating ticker (reader-home only). */
  topComments?: string[];
  /** 点6：主理人标注状态。undefined = 非主理人，不渲染标注按钮。 */
  ownerVerdict?: OwnerVerdict | null;
}

export function EventCard({
  event,
  liked = false,
  starred = false,
  downed = false,
  accentLabel,
  topComments,
  ownerVerdict,
}: EventCardProps) {
  const m = messages.card;
  const level = event.selectedLevel;
  const selectedLabel = event.selectedLabel ?? messages.selectedLabel[level];
  const author = event.authorName ?? event.sourceName ?? "";
  const handle = event.authorHandle ? ` ${event.authorHandle}` : "";
  const heat = Math.max(0, event.likeCount + event.starCount - event.downCount);

  // Content tiers by promotion level (decision: depth ∝ curation):
  //   none → source · title · summary · image · score · tags only
  //   B    → + recommendation reason + 精选 star
  //   A/S  → + hot-comments ticker
  const isSelected = level !== "none";
  const showReason = isSelected && Boolean(event.recommendationReason);
  const showComments = (level === "A" || level === "S") && Boolean(topComments?.length);
  const mediaGallery = extractCardMediaGallery(event.media);
  // Card media is a still thumbnail only. We don't inline-play video here: most card video
  // comes from X/Twitter as HLS (.m3u8) or hotlink-protected CDN URLs that a native <video>
  // can't actually play, leaving a dead control strip. For a video we show its poster (a
  // screenshot); with no poster we render nothing rather than a useless bar. The whole card
  // already routes to the detail page, where the original source link lives.
  const cardThumb =
    mediaGallery.find((item) => item.type === "image")?.url ??
    mediaGallery.map(mediaPreviewUrl).find((url): url is string => Boolean(url)) ??
    null;
  const cardThumbProxy = cardThumb ? proxiedImageUrl(cardThumb) : null;
  const lightboxImages = mediaGallery
    .map(mediaPreviewUrl)
    .filter((url): url is string => Boolean(url))
    .map((url) => ({ src: proxiedImageUrl(url) }));
  const contentLabel = eventCategoryLabel(event.category);
  // #1 每张卡至少一个标签：深度提取(score≥80)才生成 tags，普通卡为空——空时用分类兜底，
  // 连分类都没有就给「闲聊」，避免出现完全没有标签的卡片。
  const displayTags =
    event.tags.length > 0 ? event.tags.slice(0, MAX_TAGS) : [contentLabel ?? "闲聊"];
  const detailHref = `/events/${event.id}`;
  const postVariants = (event.postVariants ?? [])
    .filter((item) => item.postId && (item.title || item.excerpt || item.sourceName))
    .slice(0, 8);
  const showPostVariants = postVariants.length > 1;
  // Chinese-first titles can equal the one-line summary (deriveTitle fallback);
  // don't render the same sentence twice.
  const summaryDuplicatesTitle =
    !!event.summary && event.summary.replace(/[。.!！?？]\s*$/, "") === event.title;

  return (
    <EventCardShell eventId={event.id} detailHref={detailHref}>
      <div className="card-meta-row">
        {accentLabel ? <span className="model-tag">[ {accentLabel} ]</span> : <span />}
        <span className="card-meta-stats">
          <span className="view-count">{m.views(event.viewCount)}</span>
          {heat > 0 && (
            <span className="heat" title={m.qualityScore}>
              ◆ {heat}
            </span>
          )}
        </span>
      </div>
      <div className="card-top">
        {contentLabel && <span className="content-badge">{contentLabel}</span>}
        {event.sourceName &&
          (event.sourceUrl ? (
            <a
              className="card-source card-source-link"
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer nofollow noopener"
            >
              {event.sourceName}
            </a>
          ) : (
            <span className="card-source">{event.sourceName}</span>
          ))}
        {author && author !== event.sourceName && (
          <>
            <span className="sep" />
            <span>
              {author}
              {handle}
            </span>
          </>
        )}
        {event.publishedAt && (
          <>
            <span className="sep" />
            <time>{formatDateTime(event.publishedAt)}</time>
          </>
        )}
        {isSelected && (
          <span className={`badge ${level}`}>
            <span className="star" aria-hidden="true">
              ★
            </span>{" "}
            {selectedLabel}
          </span>
        )}
      </div>

      {/* Title routes to the in-site detail page (original text + comments live there).
          The outbound x.com link moved to the detail page where it pairs with 复制链接 —
          a raw external link is a dead click for readers who can't reach x.com. */}
      <h2>
        <TrackableDetailLink eventId={event.id} href={detailHref}>
          {event.title}
        </TrackableDetailLink>
      </h2>

      {cardThumb && cardThumbProxy && (
        <figure className="card-media">
          <ImageLightbox
            images={lightboxImages.length ? lightboxImages : [{ src: cardThumbProxy }]}
            triggerClassName="card-media-link image-lightbox-trigger"
          />
        </figure>
      )}

      {event.summary && !summaryDuplicatesTitle && (
        <p className="summary">{event.summary}</p>
      )}

      {showPostVariants && (
        <section className="event-variant-carousel" aria-label="同一事件来源合集">
          <div className="event-variant-head">
            <span>同事件合集</span>
            <small>{postVariants.length} 条来源</small>
          </div>
          <div className="event-variant-track">
            {postVariants.map((item, index) => {
              const title = item.title ?? item.excerpt ?? item.sourceName ?? "同事件来源";
              const source = item.sourceName ?? item.platform ?? "来源";
              return (
                <article className="event-variant-card" key={item.postId}>
                  <div className="event-variant-meta">
                    <span>{item.isMain ? "主线" : `${index + 1}`}</span>
                    <span>{source}</span>
                    {item.publishedAt ? <time>{formatDateTime(item.publishedAt)}</time> : null}
                  </div>
                  <strong>{title}</strong>
                  {item.excerpt && item.excerpt !== title ? <p>{item.excerpt}</p> : null}
                  {item.url ? (
                    <TrackableOriginalLink eventId={event.id} href={item.url}>
                      查看来源
                    </TrackableOriginalLink>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {showReason && (
        <p className="reason">
          <span className="label">{m.recommendationReason}</span>
          {event.recommendationReason}
        </p>
      )}

      {showComments && topComments && <CommentTicker comments={topComments} />}

      <div className="card-bottom">
        {displayTags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
        <ReactionButtons
          eventId={event.id}
          initialLikeCount={event.likeCount}
          initialStarCount={event.starCount}
          initialDownCount={event.downCount}
          initialLiked={liked}
          initialStarred={starred}
          initialDowned={downed}
        />
        {ownerVerdict !== undefined && (
          <AnnotationButtons subjectId={event.id} initialVerdict={ownerVerdict} />
        )}
      </div>

      {/* SP3 point C: inline discussion preview. #6: 评分 + 查看详情 right-aligned on this row. */}
      <div className="card-discussion">
        <InlineComments eventId={event.id} />
        <div className="card-score-detail">
          {typeof event.qualityScore === "number" && (
            <span className="score" title={m.qualityScore}>
              <span className="num">{event.qualityScore}</span>
              <span className="max">/100</span>
            </span>
          )}
          <TrackableDetailLink eventId={event.id} href={detailHref}>
            {m.detail}
          </TrackableDetailLink>
        </div>
      </div>
    </EventCardShell>
  );
}
