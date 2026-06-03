// Reader notification inbox (SP3.3 point 7). SSR, logged-in only — anonymous readers have
// no inbox, so we bounce them to login (returning here afterwards). Renders newest-first with
// unread items highlighted, then a client island marks everything read so the bell clears.

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/app/_lib/session";
import { listNotifications, type NotificationRow } from "@/db/queries/notifications";
import { messages } from "@/i18n";
import { formatDateTime } from "@/app/_lib/format";
import { MastheadAccount } from "../masthead-account";
import { MarkAllRead } from "./mark-all-read";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.notifications.heading} · ${messages.appName}`,
  robots: { index: false, follow: false },
};

function NotificationItem({ n }: { n: NotificationRow }) {
  const unread = n.readAt === null;
  const body = (
    <div className={`notification-item${unread ? " unread" : ""}`}>
      <div className="notification-main">
        <span className="notification-title">{n.title}</span>
        {n.body && <span className="notification-body">{n.body}</span>}
      </div>
      <time className="notification-time">{formatDateTime(n.createdAt)}</time>
      {unread && <span className="notification-dot" aria-label={messages.notifications.unread} />}
    </div>
  );
  // Comment-related notifications deep-link to the event; source approvals have no reader page.
  return n.eventId ? (
    <Link href={`/events/${n.eventId}`} className="notification-link">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function NotificationsPage() {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?next=/notifications");

  const items = await listNotifications(userId);
  const hasUnread = items.some((n) => n.readAt === null);
  const m = messages.notifications;

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>
            {messages.appName}
            <span className="accent-dot">.</span>
          </h1>
        </div>
        <nav>
          <Link href="/">← {m.backToFeed}</Link>
          <MastheadAccount />
        </nav>
      </header>

      <h2 className="section-intro" style={{ fontWeight: 600, color: "var(--ink)" }}>
        {m.heading}
      </h2>
      <p className="section-intro">{m.subheading}</p>

      {items.length === 0 ? (
        <div className="empty">{m.empty}</div>
      ) : (
        <ul className="notification-list">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem n={n} />
            </li>
          ))}
        </ul>
      )}

      <MarkAllRead hasUnread={hasUnread} />
    </main>
  );
}
