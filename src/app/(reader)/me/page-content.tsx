import type { CSSProperties } from "react";
import Link from "next/link";
import { getSession } from "@/app/_lib/session";
import { modelAccent } from "@/app/_lib/model-accent";
import { formatDateTime } from "@/app/_lib/format";
import { SubpageNav } from "@/app/subpage-nav";
import { listMyComments, listMyReactionEvents, type MyCommentItem } from "@/db/queries/me";
import { getViewerReactions } from "@/db/queries/reactions";
import { messages } from "@/i18n";
import { EventCard } from "../event-card";

type MyTab = "likes" | "stars" | "comments";
type ReactionTab = "likes" | "stars";

const TAB_HREFS: Record<MyTab, string> = {
  likes: "/me/likes",
  stars: "/me/stars",
  comments: "/me/comments",
};

async function getCurrentUserId(): Promise<string | null> {
  try {
    const session = await getSession();
    return (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    return null;
  }
}

function MyShell({ active, children }: { active: MyTab; children: React.ReactNode }) {
  const m = messages.me;
  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)" }}>{m.heading}</h1>
        </div>
        <SubpageNav />
      </header>

      <p className="section-intro">{m.subheading}</p>
      <nav className="me-tabs" aria-label={m.heading}>
        {(Object.keys(TAB_HREFS) as MyTab[]).map((tab) => (
          <Link
            key={tab}
            href={TAB_HREFS[tab]}
            className={active === tab ? "is-active" : ""}
            aria-current={active === tab ? "page" : undefined}
          >
            {m.tabs[tab]}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}

function LoginPrompt({ next }: { next: string }) {
  const m = messages.me;
  return (
    <div className="me-login-prompt">
      <p>{m.loginRequired}</p>
      <Link href={`/login?next=${encodeURIComponent(next)}`}>{m.loginAction}</Link>
    </div>
  );
}

function EmptyState({ tab }: { tab: MyTab }) {
  return <div className="empty">{messages.me.empty[tab]}</div>;
}

export async function MyReactionPage({ tab, kind }: { tab: ReactionTab; kind: "like" | "star" }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <MyShell active={tab}>
        <LoginPrompt next={TAB_HREFS[tab]} />
      </MyShell>
    );
  }

  const events = await listMyReactionEvents(userId, kind);
  const reactionMap = await getViewerReactions(
    events.map((event) => event.id),
    { userId, fingerprint: null },
  );

  return (
    <MyShell active={tab}>
      {events.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="feed me-feed">
          {events.map((event) => {
            const accent = modelAccent(event);
            const reactions = reactionMap.get(event.id) ?? {
              liked: false,
              starred: false,
              downed: false,
            };
            return (
              <div
                key={event.id}
                className="me-feed-card"
                style={{ "--card-accent": accent.rgb } as CSSProperties}
              >
                <EventCard
                  event={event}
                  liked={reactions.liked}
                  starred={reactions.starred}
                  downed={reactions.downed}
                  accentLabel={accent.label}
                />
              </div>
            );
          })}
        </div>
      )}
    </MyShell>
  );
}

function CommentItem({ comment }: { comment: MyCommentItem }) {
  const m = messages.me;
  return (
    <li className="me-comment-item">
      <div className="me-comment-head">
        <span className="me-comment-source">{comment.sourceName ?? "未知来源"}</span>
        <time>{formatDateTime(comment.createdAt)}</time>
        {comment.classification !== "valid" && <span className="tag">{m.lowValueComment}</span>}
      </div>
      <p>{comment.body}</p>
      <Link href={`/events/${comment.eventId}`}>
        {m.commentOn}：{comment.eventTitle}
      </Link>
    </li>
  );
}

export async function MyCommentsPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <MyShell active="comments">
        <LoginPrompt next={TAB_HREFS.comments} />
      </MyShell>
    );
  }

  const comments = await listMyComments(userId);
  return (
    <MyShell active="comments">
      {comments.length === 0 ? (
        <EmptyState tab="comments" />
      ) : (
        <ul className="me-comment-list">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ul>
      )}
    </MyShell>
  );
}
