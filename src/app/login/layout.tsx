// Route-level metadata for /login. The page itself is a client component (it owns form
// state), and client components can't export `metadata` — so the title + noindex live here
// in a server layout. An admin login should never be indexed.

import type { Metadata } from "next";
import { messages } from "@/i18n";

export const metadata: Metadata = {
  title: `登录 · ${messages.appName}`,
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
