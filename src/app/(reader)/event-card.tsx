// Presentational event card (spec: UI Content Card). Pure render from an EventCard;
// no data loading here. Answers "what happened?" (summary) and "why care?" (reason).
// Slice 8: hosts the ReactionButtons client island (likes/stars). The viewer's reacted
// state arrives as props from the SSR page so the first render isn't shifted by a
// client-side fetch.

import type { EventCard as EventCardData } from "@/db/queries/feed";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { extractCardMedia } from "@/app/_lib/media";
import { CommentTicker } from "./comment-ticker";
import { EventCardShell, TrackableDetailLink, TrackableOriginalLink } from "./event-view-tracker";
import { InlineComments } from "./inline-comments";
import { ReactionButtons } from "./reaction-buttons";

const MAX_TAGS = 4;

type EventCategoryKey = keyof typeof messages.search.eventCategory;

/** Reader-facing label for the article's public category. */
function eventCategoryLabel(category: string | null): string | null {
  if (!category || !(category in messages.search.eventCategory)) return null;
  return messages.search.eventCategory[category as EventCategoryKey];
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
}

export function EventCard({
  event,
  liked = false,
  starred = false,
  downed = false,
  accentLabel,
  topComments,
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
  const cardMedia = extractCardMedia(event.media);
  const contentLabel = eventCategoryLabel(event.category);
  const detailHref = `/events/${event.id}`;

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
        {event.sourceName && <span className="card-source">{event.sourceName}</span>}
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

      <h2>
        {event.url ? (
          <TrackableOriginalLink eventId={event.id} href={event.url}>
            {event.title}
          </TrackableOriginalLink>
        ) : (
          event.title
        )}
      </h2>

      {cardMedia && (
        <figure className="card-media">
          {cardMedia.type === "video" ? (
            <video controls preload="metadata" playsInline poster={cardMedia.poster}>
              <source src={cardMedia.url} />
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- external media, unknown host, no Next loader
            <img src={cardMedia.url} alt="" loading="lazy" />
          )}
        </figure>
      )}

      {event.summary && <p className="summary">{event.summary}</p>}

      {showReason && (
        <p className="reason">
          <span className="label">{m.recommendationReason}</span>
          {event.recommendationReason}
        </p>
      )}

      {showComments && topComments && <CommentTicker comments={topComments} />}

      <div className="card-bottom">
        {event.tags.slice(0, MAX_TAGS).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
        {typeof event.qualityScore === "number" && (
          <span className="score" title={m.qualityScore}>
            <span className="num">{event.qualityScore}</span>
            <span className="max">/100</span>
          </span>
        )}
        <TrackableDetailLink eventId={event.id} href={detailHref}>
          {m.detail}
        </TrackableDetailLink>
        <ReactionButtons
          eventId={event.id}
          initialLikeCount={event.likeCount}
          initialStarCount={event.starCount}
          initialDownCount={event.downCount}
          initialLiked={liked}
          initialStarred={starred}
          initialDowned={downed}
        />
      </div>

      {/* SP3 point C: inline discussion preview without leaving the feed. */}
      <InlineComments eventId={event.id} />
    </EventCardShell>
  );
}
