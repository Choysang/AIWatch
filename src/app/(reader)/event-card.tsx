// Presentational event card (spec: UI Content Card). Pure render from an EventCard;
// no data loading here. Answers "what happened?" (summary) and "why care?" (reason).
// Slice 8: hosts the ReactionButtons client island (likes/stars). The viewer's reacted
// state arrives as props from the SSR page so the first render isn't shifted by a
// client-side fetch.

import Link from "next/link";
import type { EventCard as EventCardData } from "@/db/queries/feed";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { extractImageUrl } from "@/app/_lib/media";
import { CommentTicker } from "./comment-ticker";
import { ReactionButtons } from "./reaction-buttons";

const MAX_TAGS = 4;

interface EventCardProps {
  event: EventCardData;
  liked?: boolean;
  starred?: boolean;
  /** Monospace brand tag (e.g. "DEEPSEEK") for the reader-home Bento treatment. */
  accentLabel?: string;
  /** Top reader comments for the rotating ticker (reader-home only). */
  topComments?: string[];
}

export function EventCard({
  event,
  liked = false,
  starred = false,
  accentLabel,
  topComments,
}: EventCardProps) {
  const m = messages.card;
  const level = event.selectedLevel;
  const selectedLabel = event.selectedLabel ?? messages.selectedLabel[level];
  const author = event.authorName ?? event.sourceName ?? "";
  const handle = event.authorHandle ? ` ${event.authorHandle}` : "";
  const heat = event.likeCount + event.starCount;

  // Content tiers by promotion level (decision: depth ∝ curation):
  //   none → source · title · summary · image · score · tags only
  //   B    → + recommendation reason + 精选 star
  //   A/S  → + hot-comments ticker
  const isSelected = level !== "none";
  const showReason = isSelected && Boolean(event.recommendationReason);
  const showComments = (level === "A" || level === "S") && Boolean(topComments?.length);
  const imageUrl = extractImageUrl(event.media);

  return (
    <article className="card">
      {accentLabel && (
        <div className="card-meta-row">
          <span className="model-tag">[ {accentLabel} ]</span>
          {heat > 0 && (
            <span className="heat" title={m.qualityScore}>
              ◆ {heat}
            </span>
          )}
        </div>
      )}
      <div className="card-top">
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
          <a href={event.url} target="_blank" rel="noopener noreferrer">
            {event.title}
          </a>
        ) : (
          event.title
        )}
      </h2>

      {imageUrl && (
        <figure className="card-media">
          {/* eslint-disable-next-line @next/next/no-img-element -- external media, unknown host, no Next loader */}
          <img src={imageUrl} alt="" loading="lazy" />
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
        <ReactionButtons
          eventId={event.id}
          initialLikeCount={event.likeCount}
          initialStarCount={event.starCount}
          initialLiked={liked}
          initialStarred={starred}
        />
        <Link className="detail-link" href={`/events/${encodeURIComponent(event.id)}`}>
          {m.detail} →
        </Link>
      </div>
    </article>
  );
}
