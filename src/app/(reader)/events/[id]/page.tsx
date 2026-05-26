// Event detail page (Slice 10). Lives at /events/[id]. SSR-fetches the event, the
// reader's reaction state (cookie or session), and the comment sections — then renders
// the same visual shape as a feed card but with the comments composer + listing below.
// notFound() on missing events keeps the route honest for crawlers/Skill consumers.

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/app/_lib/session";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { getEventDetail } from "@/db/queries/event-detail";
import { listEventComments } from "@/db/queries/comments";
import { getViewerReactions } from "@/db/queries/reactions";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { CommentsSection } from "../../comments-section";
import { ReactionButtons } from "../../reaction-buttons";

export const dynamic = "force-dynamic";

const MAX_TAGS_DETAIL = 8;

async function loadViewerIdentity(): Promise<{
  userId: string | null;
  fingerprint: string | null;
}> {
  let userId: string | null = null;
  try {
    const session = await getSession();
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    userId = null;
  }
  if (userId) return { userId, fingerprint: null };
  const ck = await cookies();
  const raw = ck.get(READER_ID_COOKIE)?.value;
  const fingerprint = await verifyReaderId(raw);
  return { userId: null, fingerprint };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventDetail(id);
  if (!event) notFound();

  const identity = await loadViewerIdentity();
  const [reactionMap, sections] = await Promise.all([
    identity.userId || identity.fingerprint
      ? getViewerReactions([event.id], identity)
      : Promise.resolve(new Map<string, { liked: boolean; starred: boolean }>()),
    listEventComments(event.id),
  ]);
  const viewerReaction = reactionMap.get(event.id) ?? { liked: false, starred: false };

  const m = messages;
  const card = m.card;
  const detail = m.detail;
  const level = event.selectedLevel;
  const selectedLabel = event.selectedLabel ?? m.selectedLabel[level];
  const author = event.authorName ?? event.sourceName ?? "";
  const handle = event.authorHandle ? ` ${event.authorHandle}` : "";

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>
            {m.appName}
            <span className="accent-dot">.</span>
          </h1>
        </div>
        <nav>
          <Link href="/">← {detail.backToFeed}</Link>
        </nav>
      </header>

      <article className="card card-detail">
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
            <span className="label">{card.recommendationReason}</span>
            {event.recommendationReason}
          </p>
        )}

        <div className="card-bottom">
          {event.tags.slice(0, MAX_TAGS_DETAIL).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
          {typeof event.qualityScore === "number" && (
            <span className="score" title={card.qualityScore}>
              <span className="num">{event.qualityScore}</span>
              <span className="max">/100</span>
            </span>
          )}
          <ReactionButtons
            eventId={event.id}
            initialLikeCount={event.likeCount}
            initialStarCount={event.starCount}
            initialLiked={viewerReaction.liked}
            initialStarred={viewerReaction.starred}
          />
        </div>
      </article>

      <CommentsSection eventId={event.id} sections={sections} />

      <p className="note">{card.summaryNote}</p>
    </main>
  );
}
