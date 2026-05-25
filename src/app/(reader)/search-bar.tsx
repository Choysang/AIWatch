// Reader search + filter bar. URL is the single source of truth (web pattern: URL-as-state),
// so results stay shareable and the page can be server-rendered. This client component only
// reads the current params and writes new ones via the router; the homepage does the fetching.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { messages } from "@/i18n";

type ChipValue = string | undefined;

const WINDOWS = ["today", "week", "month", "all"] as const;
const LEVELS = ["all", "B", "A", "S"] as const;
const MODES = ["all", "selected"] as const;

export function SearchBar() {
  const m = messages.search;
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");

  // Current selections, with the same defaults the server applies (see parsePublicQuery).
  const mode = params.get("mode") === "selected" ? "selected" : "all";
  const since = params.get("since") ?? (mode === "selected" ? "week" : "all");
  const level = params.get("level") ?? "all";

  const navigate = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const qs = next.toString();
      router.push(qs ? `/?${qs}` : "/");
    },
    [params, router],
  );

  const setParam = (key: string, value: ChipValue) =>
    navigate((next) => {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    });

  const submitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    setParam("q", trimmed || undefined);
  };

  const clearAll = () => {
    setText("");
    router.push("/");
  };

  const hasFilters =
    params.get("q") || params.get("tags") || params.get("level") || params.get("mode") || params.get("since");

  return (
    <section className="search" aria-label={m.submit}>
      <form className="search-row" role="search" onSubmit={submitQuery}>
        <input
          type="search"
          className="search-input"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={m.placeholder}
          aria-label={m.placeholder}
        />
        <button type="submit" className="search-submit">
          {m.submit}
        </button>
      </form>

      <div className="filter-group" role="group" aria-label={m.modeLabel}>
        <span className="filter-label">{m.modeLabel}</span>
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            className={`chip ${mode === value ? "is-active" : ""}`}
            aria-pressed={mode === value}
            onClick={() => setParam("mode", value === "all" ? undefined : value)}
          >
            {m.mode[value]}
          </button>
        ))}
      </div>

      <div className="filter-group" role="group" aria-label={m.windowLabel}>
        <span className="filter-label">{m.windowLabel}</span>
        {WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            className={`chip ${since === value ? "is-active" : ""}`}
            aria-pressed={since === value}
            onClick={() => setParam("since", value)}
          >
            {m.window[value]}
          </button>
        ))}
      </div>

      <div className="filter-group" role="group" aria-label={m.levelLabel}>
        <span className="filter-label">{m.levelLabel}</span>
        {LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            className={`chip ${level === value ? "is-active" : ""}`}
            aria-pressed={level === value}
            onClick={() => setParam("level", value === "all" ? undefined : value)}
          >
            {m.level[value]}
          </button>
        ))}
        {hasFilters && (
          <button type="button" className="chip chip-clear" onClick={clearAll}>
            {m.clear}
          </button>
        )}
      </div>
    </section>
  );
}
