"use client";

// "复制原文链接" affordance (2026-06-12): mainland readers often can't open x.com
// directly, so beside the outbound link we offer a one-tap copy of the original URL
// (to paste into a proxied browser or share elsewhere). Clipboard API first, with a
// hidden-textarea fallback for older WebViews.

import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n";

const RESET_DELAY_MS = 2000;

function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CopyLinkButton({ url }: { url: string }) {
  const m = messages.card;
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    setState(ok ? "copied" : "failed");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), RESET_DELAY_MS);
  }

  const label =
    state === "copied" ? m.copyLinkCopied : state === "failed" ? m.copyLinkFailed : m.copyLink;

  return (
    <button
      type="button"
      className={`copy-link-btn ${state === "copied" ? "is-copied" : ""}`}
      onClick={() => void copy()}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
