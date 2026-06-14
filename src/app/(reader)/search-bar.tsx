// Reader search + filter bar. URL is the single source of truth (web pattern: URL-as-state),
// so results stay shareable and the page can be server-rendered. This client component only
// reads the current params and writes new ones via the router; the homepage does the fetching.

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { messages } from "@/i18n";
import {
  EVENT_CATEGORIES,
  SOURCE_CATEGORIES,
  type EventCategory,
  type SourceCategory,
} from "@/public/query";
import { AI_SOURCE_CATEGORY_SHORT_LABEL } from "@/sources/ai-source-categories";

type ChipValue = string | undefined;
type DraftField = { routeValue: string; value: string };

const WINDOWS = ["today", "week", "month", "all"] as const;
const SEARCH_MODES = ["latest", "selected"] as const;
type SearchMode = (typeof SEARCH_MODES)[number];
type TimeChoice = (typeof WINDOWS)[number] | "custom";

function draftValue(draft: DraftField, routeValue: string) {
  return draft.routeValue === routeValue ? draft.value : routeValue;
}

function parseSourceCategoryParam(raw: string | null): Set<SourceCategory> {
  const set = new Set<SourceCategory>();
  if (!raw) return set;
  const known: ReadonlySet<string> = new Set(SOURCE_CATEGORIES);
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && known.has(v)) set.add(v as SourceCategory);
  }
  return set;
}

function normalizeScore(raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return String(Math.floor(n));
}

function readTimeChoice(raw: string | null): (typeof WINDOWS)[number] {
  return raw === "today" || raw === "week" || raw === "month" ? raw : "all";
}

function parseSourcesParam(raw: string | null): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id) set.add(id);
  }
  return set;
}

export interface SearchBarSourceOption {
  id: string;
  name: string;
  platform: string;
}

export function SearchBar({
  sourceOptions = [],
  isLoggedIn = false,
  defaultApplied = false,
}: {
  /** 指定信源筛选的可选项（启用中的信源）。空数组时该区不渲染。 */
  sourceOptions?: SearchBarSourceOption[];
  /** 登录读者可把当前信源选择存为默认（bestblogs 式定制）。 */
  isLoggedIn?: boolean;
  /** 本次渲染由保存的默认信源筛选驱动（URL 未带 sources 参数）。 */
  defaultApplied?: boolean;
}) {
  const m = messages.search;
  const router = useRouter();
  const params = useSearchParams();
  const queryParam = params.get("q") ?? "";
  const fromParam = params.get("from") ?? "";
  const toParam = params.get("to") ?? "";
  const minScoreParam = params.get("minScore") ?? "";
  const hasCustomRange = Boolean(fromParam || toParam);
  const routeTimeChoice: TimeChoice = hasCustomRange ? "custom" : readTimeChoice(params.get("since"));

  const [textDraft, setTextDraft] = useState<DraftField>({
    routeValue: queryParam,
    value: queryParam,
  });
  const [fromDraft, setFromDraft] = useState<DraftField>({
    routeValue: fromParam,
    value: fromParam,
  });
  const [toDraft, setToDraft] = useState<DraftField>({
    routeValue: toParam,
    value: toParam,
  });
  const [minScoreDraft, setMinScoreDraft] = useState<DraftField>({
    routeValue: minScoreParam,
    value: minScoreParam,
  });
  const [timeDraft, setTimeDraft] = useState<DraftField>({
    routeValue: routeTimeChoice,
    value: routeTimeChoice,
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 指定信源多选：面板内为草稿态，点「应用筛选」才写回 URL（sources=id1,id2）。
  const sourcesParam = params.get("sources") ?? "";
  const [sourcesDraft, setSourcesDraft] = useState<DraftField>({
    routeValue: sourcesParam,
    value: sourcesParam,
  });
  const sourcesVal = draftValue(sourcesDraft, sourcesParam);
  const selectedSources = parseSourcesParam(sourcesVal || null);
  const [prefsStatus, setPrefsStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");

  const toggleSourceDraft = (id: string) => {
    const next = new Set(selectedSources);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSourcesDraft({ routeValue: sourcesParam, value: [...next].join(",") });
  };

  const savePreference = async (defaultSourceIds: string[] | null) => {
    setPrefsStatus("idle");
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultSourceIds }),
      });
      if (!res.ok) throw new Error(`preferences failed: ${res.status}`);
      setPrefsStatus(defaultSourceIds === null ? "cleared" : "saved");
    } catch {
      setPrefsStatus("error");
    }
  };

  const text = draftValue(textDraft, queryParam);
  const fromVal = draftValue(fromDraft, fromParam);
  const toVal = draftValue(toDraft, toParam);
  const minScoreVal = draftValue(minScoreDraft, minScoreParam);
  const timeChoice = draftValue(timeDraft, routeTimeChoice) as TimeChoice;
  const mode: SearchMode =
    params.get("mode") === "latest" || params.get("mode") === "all" ? "latest" : "selected";
  const selectedSourceCategories = parseSourceCategoryParam(params.get("sourceCategories"));
  const selectedEventCategory = params.get("category") as EventCategory | null;
  const nativeSubmitParams = Array.from(params.entries()).filter(([key]) => key !== "q");
  const hasPanelFilters = Boolean(
    params.get("since") || fromParam || toParam || minScoreParam || sourcesParam,
  );

  const navigate = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const qs = next.toString();
      const href = qs ? `/?${qs}` : "/";
      router.prefetch(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [params, router, startTransition],
  );

  const setParam = (key: string, value: ChipValue) =>
    navigate((next) => {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    });

  const setMode = (value: SearchMode) =>
    navigate((next) => {
      if (value === "latest") next.set("mode", "latest");
      else next.delete("mode");
    });

  const selectTime = (value: TimeChoice) => {
    setTimeDraft({ routeValue: routeTimeChoice, value });
    if (value !== "custom") {
      setFromDraft({ routeValue: fromParam, value: "" });
      setToDraft({ routeValue: toParam, value: "" });
    }
  };

  const toggleSourceCategory = (category: SourceCategory) =>
    navigate((next) => {
      const current = parseSourceCategoryParam(next.get("sourceCategories"));
      if (current.size === 1 && current.has(category)) {
        next.delete("sourceCategories");
      } else {
        next.set("sourceCategories", category);
      }
    });

  const toggleEventCategory = (value: EventCategory) =>
    navigate((next) => {
      if (next.get("category") === value) next.delete("category");
      else next.set("category", value);
    });

  const submitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const trimmed = String(data.get("q") ?? "").trim();
    setTextDraft({ routeValue: queryParam, value: trimmed });
    setParam("q", trimmed || undefined);
  };

  const applyPanelFilters = () =>
    navigate((next) => {
      if (timeChoice === "custom") {
        if (fromVal) next.set("from", fromVal);
        else next.delete("from");
        if (toVal) next.set("to", toVal);
        else next.delete("to");
        next.delete("since");
      } else {
        next.delete("from");
        next.delete("to");
        if (timeChoice === "all") next.delete("since");
        else next.set("since", timeChoice);
      }

      const score = normalizeScore(minScoreVal);
      if (score) next.set("minScore", score);
      else next.delete("minScore");

      if (sourcesVal) next.set("sources", sourcesVal);
      else next.delete("sources");
    });

  const clearPanelFilters = () => {
    setTimeDraft({ routeValue: routeTimeChoice, value: "all" });
    setFromDraft({ routeValue: fromParam, value: "" });
    setToDraft({ routeValue: toParam, value: "" });
    setMinScoreDraft({ routeValue: minScoreParam, value: "" });
    setSourcesDraft({ routeValue: sourcesParam, value: "" });
    navigate((next) => {
      next.delete("since");
      next.delete("from");
      next.delete("to");
      next.delete("minScore");
      next.delete("sources");
    });
  };

  const clearAll = () => {
    setTextDraft({ routeValue: queryParam, value: "" });
    setTimeDraft({ routeValue: routeTimeChoice, value: "all" });
    setFromDraft({ routeValue: fromParam, value: "" });
    setToDraft({ routeValue: toParam, value: "" });
    setMinScoreDraft({ routeValue: minScoreParam, value: "" });
    setSourcesDraft({ routeValue: sourcesParam, value: "" });
    router.prefetch("/");
    startTransition(() => {
      router.push("/");
    });
  };

  const hasFilters =
    params.get("q") ||
    params.get("tags") ||
    params.get("mode") ||
    params.get("since") ||
    params.get("from") ||
    params.get("to") ||
    params.get("minScore") ||
    params.get("sourceTypes") ||
    params.get("sourceCategories") ||
    params.get("contentTypes") ||
    params.get("sources") ||
    params.get("category");

  return (
    <section
      className={`search ${isPending ? "is-pending" : ""}`}
      aria-label={m.submit}
      aria-busy={isPending}
    >
      <div className="search-main-row">
        <div className="search-mode-tabs" role="group" aria-label={m.modeLabel}>
          {SEARCH_MODES.map((value) => (
            <button
              key={value}
              type="button"
              className={`search-mode-tab ${mode === value ? "is-active" : ""}`}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {m.mode[value]}
            </button>
          ))}
        </div>

        <div className="search-filter-line">
          <div className="search-facet-row" role="group" aria-label={m.sourceCategoryLabel}>
            <span className="filter-label">{m.sourceCategoryLabel}</span>
            {SOURCE_CATEGORIES.map((category) => {
              const active = selectedSourceCategories.has(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`chip ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleSourceCategory(category)}
                >
                  {m.sourceCategory[category] ?? AI_SOURCE_CATEGORY_SHORT_LABEL[category]}
                </button>
              );
            })}
          </div>
          <div className="search-category-actions">
            <div className="search-facet-row" role="group" aria-label={m.eventCategoryLabel}>
              <span className="filter-label">{m.eventCategoryLabel}</span>
              {EVENT_CATEGORIES.map((value) => {
                const active = selectedEventCategory === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${active ? "is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => toggleEventCategory(value)}
                  >
                    {m.eventCategory[value]}
                  </button>
                );
              })}
            </div>

            <form
              className="search-row search-action-row"
              role="search"
              action="/"
              method="get"
              onSubmit={submitQuery}
            >
          {nativeSubmitParams.map(([key, value]) => (
            <input key={`${key}:${value}`} type="hidden" name={key} value={value} />
          ))}
          <input
            type="search"
            className="search-input"
            name="q"
            value={text}
            onChange={(e) => setTextDraft({ routeValue: queryParam, value: e.target.value })}
            placeholder={m.placeholder}
            aria-label={m.placeholder}
          />
          <div className="search-filter-popover">
            <button
              type="button"
              className={`search-filter-toggle ${filterPanelOpen || hasPanelFilters ? "is-active" : ""}`}
              aria-expanded={filterPanelOpen}
              aria-controls="reader-search-filter-panel"
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              {m.filterButton}
            </button>
            {filterPanelOpen && (
              <div id="reader-search-filter-panel" className="search-filter-panel">
                <div className="search-filter-panel-head">
                  <strong>{m.filterPanelTitle}</strong>
                  <span>{hasPanelFilters ? m.filterPanelActive : m.filterPanelIdle}</span>
                </div>

                <div className="search-filter-section" role="group" aria-label={m.windowLabel}>
                  <span className="filter-label">{m.windowLabel}</span>
                  <div className="search-filter-options">
                    {WINDOWS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`chip ${timeChoice === value ? "is-active" : ""}`}
                        aria-pressed={timeChoice === value}
                        onClick={() => selectTime(value)}
                      >
                        {m.window[value]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`chip ${timeChoice === "custom" ? "is-active" : ""}`}
                      aria-pressed={timeChoice === "custom"}
                      onClick={() => selectTime("custom")}
                    >
                      {m.customLabel}
                    </button>
                  </div>
                  {timeChoice === "custom" && (
                    <div className="search-date-range">
                      <input
                        type="date"
                        className="search-date"
                        value={fromVal}
                        max={toVal || undefined}
                        aria-label={m.dateFromLabel}
                        onChange={(e) =>
                          setFromDraft({ routeValue: fromParam, value: e.target.value })
                        }
                      />
                      <span className="date-sep" aria-hidden="true">
                        -
                      </span>
                      <input
                        type="date"
                        className="search-date"
                        value={toVal}
                        min={fromVal || undefined}
                        aria-label={m.dateToLabel}
                        onChange={(e) =>
                          setToDraft({ routeValue: toParam, value: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="search-filter-section" role="group" aria-label={m.scoreLabel}>
                  <span className="filter-label">{m.scoreLabel}</span>
                  <div className="search-score-row">
                    <button
                      type="button"
                      className={`chip ${!minScoreVal ? "is-active" : ""}`}
                      aria-pressed={!minScoreVal}
                      onClick={() => setMinScoreDraft({ routeValue: minScoreParam, value: "" })}
                    >
                      {m.scoreUnlimited}
                    </button>
                    <label className="score-input-label">
                      <span>{m.scoreMinLabel}</span>
                      <input
                        type="number"
                        className="score-input"
                        name="minScore"
                        min={0}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        value={minScoreVal}
                        placeholder="不限"
                        onChange={(e) =>
                          setMinScoreDraft({ routeValue: minScoreParam, value: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>

                {sourceOptions.length > 0 && (
                  <div className="search-filter-section" role="group" aria-label={m.sourcePickLabel}>
                    <span className="filter-label">
                      {m.sourcePickLabel}
                      {selectedSources.size > 0 ? `（已选 ${selectedSources.size}）` : ""}
                    </span>
                    <div className="search-source-grid">
                      {sourceOptions.map((option) => {
                        const active = selectedSources.has(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`chip ${active ? "is-active" : ""}`}
                            aria-pressed={active}
                            onClick={() => toggleSourceDraft(option.id)}
                          >
                            {option.name}
                          </button>
                        );
                      })}
                    </div>
                    {selectedSources.size > 0 && (
                      <button
                        type="button"
                        className="chip chip-clear"
                        onClick={() => setSourcesDraft({ routeValue: sourcesParam, value: "" })}
                      >
                        {m.sourcePickClear}
                      </button>
                    )}
                    {isLoggedIn && (
                      <div className="search-source-prefs">
                        <button
                          type="button"
                          className="chip"
                          onClick={() => savePreference([...selectedSources])}
                        >
                          {m.sourcePrefSave}
                        </button>
                        <button
                          type="button"
                          className="chip chip-clear"
                          onClick={() => savePreference(null)}
                        >
                          {m.sourcePrefClear}
                        </button>
                        {prefsStatus !== "idle" && (
                          <span className="search-source-prefs-status">
                            {m.sourcePrefStatus[prefsStatus]}
                          </span>
                        )}
                      </div>
                    )}
                    {defaultApplied && (
                      <p className="search-source-prefs-note">{m.sourcePrefApplied}</p>
                    )}
                  </div>
                )}

                <div className="search-filter-actions">
                  <button type="button" className="chip chip-clear" onClick={clearPanelFilters}>
                    {m.clearPanel}
                  </button>
                  <button type="button" className="search-submit" onClick={applyPanelFilters}>
                    {m.applyFilters}
                  </button>
                </div>

                <p className="search-filter-recommend">
                  {m.recommendSourceHint}
                  <Link href="/recommend-source">{m.recommendSourceLink} →</Link>
                </p>
                <p className="search-filter-recommend">
                  {messages.boards.exportHint}
                  <a href="/api/boards/opml">{messages.boards.exportOpml} ↓</a>
                </p>
              </div>
            )}
          </div>
          {hasFilters && (
            <button type="button" className="chip chip-clear" onClick={clearAll}>
              {m.clear}
            </button>
          )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
