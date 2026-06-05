// Reader search + filter bar. URL is the single source of truth (web pattern: URL-as-state),
// so results stay shareable and the page can be server-rendered. This client component only
// reads the current params and writes new ones via the router; the homepage does the fetching.
//
// SP2: the "等级 B/A/S" chip group was removed from the reader UI (the `level` param still
// works for the public API). Source filtering is now four reader-facing groups (官方/专家/
// 媒体/社区) that expand to the underlying source_types. A custom date range overrides the
// rolling time window when set.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { messages } from "@/i18n";
import { CONTENT_TYPES, SOURCE_TYPES, type ContentType, type SourceType } from "@/public/query";
import {
  GROUP_MEMBERS,
  SOURCE_GROUPS,
  groupMembers,
  type SourceGroup,
} from "@/public/source-groups";

type ChipValue = string | undefined;

const WINDOWS = ["today", "week", "month", "all"] as const;
const MODES = ["all", "selected"] as const;

function parseSourceTypeParam(raw: string | null): Set<SourceType> {
  const set = new Set<SourceType>();
  if (!raw) return set;
  const known: ReadonlySet<string> = new Set(SOURCE_TYPES);
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && known.has(v)) set.add(v as SourceType);
  }
  return set;
}

function parseContentTypeParam(raw: string | null): Set<ContentType> {
  const set = new Set<ContentType>();
  if (!raw) return set;
  const known: ReadonlySet<string> = new Set(CONTENT_TYPES);
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && known.has(v)) set.add(v as ContentType);
  }
  return set;
}

/** A group reads as "on" only when all of its member source_types are currently selected. */
function isGroupActive(selected: Set<SourceType>, group: SourceGroup): boolean {
  return GROUP_MEMBERS[group].every((t) => selected.has(t));
}

function isOnlyGroupActive(selected: Set<SourceType>, group: SourceGroup): boolean {
  const members = GROUP_MEMBERS[group];
  return selected.size === members.length && members.every((t) => selected.has(t));
}

export function SearchBar() {
  const m = messages.search;
  const router = useRouter();
  const params = useSearchParams();
  const queryParam = params.get("q") ?? "";
  const fromParam = params.get("from") ?? "";
  const toParam = params.get("to") ?? "";
  const [text, setText] = useState(queryParam);
  const [fromVal, setFromVal] = useState(fromParam);
  const [toVal, setToVal] = useState(toParam);

  // Current selections, with the same defaults the server applies (see parsePublicQuery).
  const mode = params.get("mode") === "selected" ? "selected" : "all";
  const hasCustomRange = Boolean(params.get("from") || params.get("to"));
  const [showCustomRange, setShowCustomRange] = useState(hasCustomRange);
  const showRangeControls = showCustomRange || hasCustomRange;
  const since = params.get("since") ?? (mode === "selected" ? "week" : "all");
  const selectedSourceTypes = parseSourceTypeParam(params.get("sourceTypes"));
  const selectedContentTypes = parseContentTypeParam(params.get("contentTypes"));
  const nativeSubmitParams = Array.from(params.entries()).filter(([key]) => key !== "q");

  useEffect(() => {
    setText(queryParam);
  }, [queryParam]);

  useEffect(() => {
    setFromVal(fromParam);
  }, [fromParam]);

  useEffect(() => {
    setToVal(toParam);
  }, [toParam]);

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

  // Selecting a rolling window clears any custom range (they are mutually exclusive).
  const selectWindow = (value: string) => {
    setShowCustomRange(false);
    navigate((next) => {
      next.set("since", value);
      next.delete("from");
      next.delete("to");
    });
  };

  const applyRange = () =>
    navigate((next) => {
      if (fromVal) next.set("from", fromVal);
      else next.delete("from");
      if (toVal) next.set("to", toVal);
      else next.delete("to");
      // A custom range supersedes the rolling window.
      if (fromVal || toVal) next.delete("since");
    });

  const toggleSourceGroup = (group: SourceGroup) =>
    navigate((next) => {
      const current = parseSourceTypeParam(next.get("sourceTypes"));
      if (isOnlyGroupActive(current, group)) {
        next.delete("sourceTypes");
      } else {
        const members = new Set(groupMembers(group));
        next.set("sourceTypes", SOURCE_TYPES.filter((t) => members.has(t)).join(","));
      }
    });

  const toggleContentType = (value: ContentType) =>
    navigate((next) => {
      const current = parseContentTypeParam(next.get("contentTypes"));
      if (current.size === 1 && current.has(value)) next.delete("contentTypes");
      else next.set("contentTypes", value);
    });

  const submitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const trimmed = String(data.get("q") ?? "").trim();
    setText(trimmed);
    setParam("q", trimmed || undefined);
  };

  const clearAll = () => {
    setText("");
    setFromVal("");
    setToVal("");
    setShowCustomRange(false);
    router.push("/");
  };

  const hasFilters =
    params.get("q") ||
    params.get("tags") ||
    params.get("mode") ||
    params.get("since") ||
    params.get("from") ||
    params.get("to") ||
    params.get("sourceTypes") ||
    params.get("contentTypes");

  return (
    <section className="search" aria-label={m.submit}>
      <form className="search-row" role="search" action="/" method="get" onSubmit={submitQuery}>
        {nativeSubmitParams.map(([key, value], index) => (
          <input key={`${key}:${index}`} type="hidden" name={key} value={value} />
        ))}
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
            className={`chip ${!hasCustomRange && since === value ? "is-active" : ""}`}
            aria-pressed={!hasCustomRange && since === value}
            onClick={() => selectWindow(value)}
          >
            {m.window[value]}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${showRangeControls ? "is-active" : ""}`}
          aria-pressed={showRangeControls}
          onClick={() => setShowCustomRange(true)}
        >
          {m.customLabel}
        </button>
        {showRangeControls && (
          <>
            <input
              type="date"
              className="search-date"
              value={fromVal}
              max={toVal || undefined}
              aria-label={m.dateFromLabel}
              onChange={(e) => setFromVal(e.target.value)}
            />
            <span className="date-sep" aria-hidden="true">
              –
            </span>
            <input
              type="date"
              className="search-date"
              value={toVal}
              min={fromVal || undefined}
              aria-label={m.dateToLabel}
              onChange={(e) => setToVal(e.target.value)}
            />
            <button type="button" className="chip" onClick={applyRange}>
              {m.dateApply}
            </button>
          </>
        )}
      </div>

      <div className="filter-group" role="group" aria-label={m.sourceGroupLabel}>
        <span className="filter-label">{m.sourceGroupLabel}</span>
        {SOURCE_GROUPS.map((group) => {
          const active = isGroupActive(selectedSourceTypes, group);
          return (
            <button
              key={group}
              type="button"
              className={`chip ${active ? "is-active" : ""}`}
              aria-pressed={active}
              onClick={() => toggleSourceGroup(group)}
            >
              {m.sourceGroup[group]}
            </button>
          );
        })}
      </div>

      <div className="filter-group" role="group" aria-label={m.contentTypeLabel}>
        <span className="filter-label">{m.contentTypeLabel}</span>
        {CONTENT_TYPES.map((value) => {
          const active = selectedContentTypes.has(value);
          return (
            <button
              key={value}
              type="button"
              className={`chip ${active ? "is-active" : ""}`}
              aria-pressed={active}
              onClick={() => toggleContentType(value)}
            >
              {m.contentType[value]}
            </button>
          );
        })}
        {hasFilters && (
          <button type="button" className="chip chip-clear" onClick={clearAll}>
            {m.clear}
          </button>
        )}
      </div>
    </section>
  );
}
