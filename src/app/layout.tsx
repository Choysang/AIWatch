import type { Metadata } from "next";
import Script from "next/script";
import { messages } from "@/i18n";
import { BackToTop } from "./back-to-top";
import { ButtonTooltips } from "./button-tooltips";
import "./globals.css";

const readerThemeScript = `
(function () {
  try {
    var key = "aiwatch:reader-theme-mode";
    var mode = localStorage.getItem(key) || "system";
    if (mode !== "dark" && mode !== "system" && mode !== "light") mode = "system";
    var systemLight =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: light)").matches;
    var theme = mode === "system" ? (systemLight ? "light" : "dark") : mode;
    document.documentElement.setAttribute("data-reader-theme-mode", mode);
    document.documentElement.setAttribute("data-reader-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-reader-theme-mode", "system");
    document.documentElement.setAttribute("data-reader-theme", "dark");
  }
})();
`;

export const metadata: Metadata = {
  title: `${messages.appName} · ${messages.tagline}`,
  description: messages.home.subheading,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script id="reader-theme-script" strategy="beforeInteractive">
          {readerThemeScript}
        </Script>
        {children}
        <ButtonTooltips />
        <BackToTop />
      </body>
    </html>
  );
}
