import { messages } from "@/i18n";
import { MyCommentsPage } from "../page-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.me.tabs.comments} · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export default function CommentsPage() {
  return <MyCommentsPage />;
}
