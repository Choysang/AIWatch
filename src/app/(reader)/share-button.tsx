"use client";

import { useEffect, useRef, useState } from "react";

const RESET_DELAY_MS = 2200;

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

function shareText(title: string, text: string | null, url: string): string {
  return [title, text, url].filter((part) => part && part.trim()).join("\n\n");
}

export function ShareButton({
  title,
  text,
  url,
}: {
  title: string;
  text: string | null;
  url: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function resetSoon() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), RESET_DELAY_MS);
  }

  async function share() {
    const absoluteUrl = new URL(url, window.location.origin).toString();
    const payload = { title, text: text ?? title, url: absoluteUrl };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
    }

    let ok = false;
    try {
      await navigator.clipboard.writeText(shareText(title, text, absoluteUrl));
      ok = true;
    } catch {
      ok = legacyCopy(shareText(title, text, absoluteUrl));
    }
    setState(ok ? "copied" : "failed");
    resetSoon();
  }

  const label = state === "copied" ? "已复制分享文案" : state === "failed" ? "分享失败" : "一键分享";

  return (
    <button
      type="button"
      className={`copy-link-btn share-btn ${state === "copied" ? "is-copied" : ""}`}
      onClick={() => void share()}
      aria-live="polite"
      title="调用系统分享面板；不支持时复制标题、摘要和站内链接"
    >
      {label}
    </button>
  );
}
