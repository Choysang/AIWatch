"use client";

import { useEffect } from "react";

const MAX_TOOLTIP_LENGTH = 40;

function buttonLabel(button: HTMLButtonElement): string {
  const label =
    button.getAttribute("data-tooltip") ||
    button.getAttribute("aria-label") ||
    button.textContent ||
    "";
  return label.replace(/\s+/g, " ").trim().slice(0, MAX_TOOLTIP_LENGTH);
}

export function ButtonTooltips() {
  useEffect(() => {
    function ensureTitle(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement) || button.title) return;
      const label = buttonLabel(button);
      if (label) button.title = label;
    }

    document.addEventListener("pointerover", ensureTitle, true);
    document.addEventListener("focusin", ensureTitle, true);
    return () => {
      document.removeEventListener("pointerover", ensureTitle, true);
      document.removeEventListener("focusin", ensureTitle, true);
    };
  }, []);

  return null;
}
