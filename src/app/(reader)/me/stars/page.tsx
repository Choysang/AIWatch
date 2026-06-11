import { messages } from "@/i18n";
import { MyReactionPage } from "../page-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${messages.me.tabs.stars} · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export default function StarsPage() {
  return <MyReactionPage tab="stars" kind="star" />;
}
