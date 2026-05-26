// Presentational event card (spec: UI Content Card). Pure render from an EventCard;
// no data loading here. Answers "what happened?" (summary) and "why care?" (reason).
// Slice 8: hosts the ReactionButtons client island (likes/stars). The viewer's reacted
// state arrives as props from the SSR page so the first render isn't shifted by a
// client-side fetch.

import type { EventCard as EventCardData } from "@/db/queries/feed";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { ReactionButtons } from "./reaction-buttons";

const MAX_TAGS = 4;

interface EventCardProps {
  event: EventCardData;
  liked?: boolean;
  starred?: boolean;
}

export function EventCard({ event, liked = false, starred = false }: EventCardProps) {
  const m = messages.card;
  const level = event.selectedLevel;
  const selectedLabel = event.selectedLabel ?? messages.selectedLabel[level];
  const author = event.authorName ?? event.sourceName ?? "";
  const handle = event.authorHandle ? ` ${event.authorHandle}` : "";

  return (
    <article className="card">
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
        {level !== "none" && <span className={`badge ${level}`}>{selectedLabel}</span>}
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

      {event.summary && <p className="summary">{event.summary}</p>}

      {event.recommendationReason && (
        <p className="reason">
          <span className="label">{m.recommendationReason}</span>
          {event.recommendationReason}
        </p>
      )}

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
      </div>
    </article>
  );
}
