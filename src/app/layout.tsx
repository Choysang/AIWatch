import type { Metadata } from "next";
import { messages } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: `${messages.appName} · ${messages.tagline}`,
  description: messages.home.subheading,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
