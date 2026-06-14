// Event detail page (Slice 10). Lives at /events/[id]. SSR-fetches the event, the
// reader's reaction state (cookie or session), and comments — then renders
// the same visual shape as a feed card but with the comments composer + listing below.
// notFound() on missing events keeps the route honest for crawlers/Skill consumers.

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@/app/_lib/session";
import { htmlToReadableText } from "@/app/_lib/html-text";
import { extractCardMedia } from "@/app/_lib/media";
import { SubpageNav } from "@/app/subpage-nav";
import { READER_ID_COOKIE, verifyReaderId } from "@/auth/reader-id";
import { getEventDetail } from "@/db/queries/event-detail";
import { listEventComments, type CommentSections } from "@/db/queries/comments";
import { getViewerCommentReactions } from "@/db/queries/comment-reactions";
import { getViewerReactions, type ViewerReactionState } from "@/db/queries/reactions";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { CommentsSection } from "../../comments-section";
import { ContentLayers } from "../../content-layers";
import { CopyLinkButton } from "../../copy-link-button";
import { TrackableOriginalLink } from "../../event-view-tracker";
import { ReactionButtons } from "../../reaction-buttons";

export const dynamic = "force-dynamic";

const MAX_TAGS_DETAIL = 8;

// Per-event title/description so shares and crawlers see the actual event, not a generic
// page title. Degrades to the app name if the event is gone or the DB is unreachable.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<{ title: string; description?: string }> {
  try {
    const { id } = await params;
    const event = await getEventDetail(id);
    if (event) {
      return { title: `${event.title} · ${messages.appName}`, description: event.summary ?? undefined };
    }
  } catch {
    // fall through to the generic title
  }
  return { title: messages.appName };
}

/** Flatten every comment id (top-level + nested replies). */
function collectCommentIds(sections: CommentSections): string[] {
  const ids = new Set<string>();
  for (const c of sections.items) {
    ids.add(c.id);
    for (const r of c.replies) ids.add(r.id);
  }
  return [...ids];
}

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
      : Promise.resolve(new Map<string, ViewerReactionState>()),
    listEventComments(event.id),
  ]);
  const viewerReaction = reactionMap.get(event.id) ?? {
    liked: false,
    starred: false,
    downed: false,
  };

  // SP3.1: which comments (top-level + replies) has this viewer liked? One lookup for all.
  const commentIds = collectCommentIds(sections);
  const likedIds =
    (identity.userId || identity.fingerprint) && commentIds.length > 0
      ? new Set((await getViewerCommentReactions(commentIds, identity)).keys())
      : new Set<string>();

  const m = messages;
  const card = m.card;
  const level = event.selectedLevel;
  const selectedLabel = event.selectedLabel ?? m.selectedLabel[level];
  const author = event.authorName ?? event.sourceName ?? "";
  const handle = event.authorHandle ? ` ${event.authorHandle}` : "";
  const cardMedia = extractCardMedia(event.media);

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>
            {m.appName}
            <span className="accent-dot">.</span>
          </h1>
        </div>
        <SubpageNav />
      </header>

      <article className="card card-detail">
        <div className="card-meta-row">
          <span />
          <span className="card-meta-stats">
            <span className="view-count">{card.views(event.viewCount)}</span>
          </span>
        </div>
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

        {/* B1 (v0.5): 内容分层切换 AI 摘要 / 原文 / 全文。默认 AI（保持原行为）；原文是已转
            纯文本的原帖内容；全文按需经 readability 抽取。原帖 HTML 在服务端转可读纯文本。 */}
        <ContentLayers
          eventId={event.id}
          summary={event.summary}
          recommendationReason={event.recommendationReason}
          originalText={event.rawContent ? htmlToReadableText(event.rawContent) : null}
        />

        {event.url && (
          <div className="original-actions">
            <TrackableOriginalLink eventId={event.id} href={event.url}>
              {m.detail.openOriginal} ↗
            </TrackableOriginalLink>
            <CopyLinkButton url={event.url} />
          </div>
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
            initialDownCount={event.downCount}
            initialLiked={viewerReaction.liked}
            initialStarred={viewerReaction.starred}
            initialDowned={viewerReaction.downed}
          />
        </div>
      </article>

      <CommentsSection
        eventId={event.id}
        comments={sections.items}
        initialSort={sections.sort}
        likedIds={likedIds}
      />

      <p className="note">{card.summaryNote}</p>
    </main>
  );
}
