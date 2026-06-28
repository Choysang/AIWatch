// Reader search + filter bar. URL is the single source of truth (web pattern: URL-as-state),
// so results stay shareable and the page can be server-rendered. This client component only
// reads the current params and writes new ones via the router; the homepage does the fetching.

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { messages } from "@/i18n";
import {
  EVENT_CATEGORIES,
  type EventCategory,
} from "@/public/query";
import {
  expandGroups,
  groupForSourceType,
  SOURCE_GROUPS,
  type SourceGroup,
} from "@/public/source-groups";

type ChipValue = string | undefined;
type DraftField = { routeValue: string; value: string };
type OptimisticParams = { base: string; value: string };

const WINDOWS = ["today", "week", "month", "all"] as const;
const SEARCH_MODES = ["latest", "selected", "personalized"] as const;
type SearchMode = (typeof SEARCH_MODES)[number];
type TimeChoice = (typeof WINDOWS)[number] | "custom";

function draftValue(draft: DraftField, routeValue: string) {
  return draft.routeValue === routeValue ? draft.value : routeValue;
}

function parseSourceGroupParam(raw: string | null): Set<SourceGroup> {
  const set = new Set<SourceGroup>();
  if (!raw) return set;
  for (const part of raw.split(",")) {
    const group = groupForSourceType(part.trim());
    if (group) set.add(group);
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
  sourceType: string;
  categories: string[];
  eventCount: number;
}

const EMPTY_SOURCE_OPTIONS: SearchBarSourceOption[] = [];
const EMPTY_EVENT_CATEGORIES: EventCategory[] = [];

export function SearchBar({
  sourceOptions = EMPTY_SOURCE_OPTIONS,
  availableEventCategories = EMPTY_EVENT_CATEGORIES,
  isLoggedIn = false,
  defaultApplied = false,
  hasBoards = false,
}: {
  /** 指定信源筛选的可选项（启用中且已有内容的信源）。空数组时该区不渲染。 */
  sourceOptions?: SearchBarSourceOption[];
  /** 当前结果里实际出现过的事件分类；用于隐藏空分类。 */
  availableEventCategories?: EventCategory[];
  /** 登录读者可把当前信源选择存为默认（bestblogs 式定制）。 */
  isLoggedIn?: boolean;
  /** 本次渲染由保存的默认信源筛选驱动（URL 未带 sources 参数）。 */
  defaultApplied?: boolean;
  /** 读者是否已建主题板：决定「推荐」档是否出现（B v0.5：推荐=主题板内容）。 */
  hasBoards?: boolean;
}) {
  const m = messages.search;
  const router = useRouter();
  const routeParams = useSearchParams();
  const routeParamString = routeParams.toString();
  const [optimisticParams, setOptimisticParams] = useState<OptimisticParams | null>(null);
  const effectiveParamString = optimisticParams?.base === routeParamString
    ? optimisticParams.value
    : routeParamString;
  const params = useMemo(
    () => new URLSearchParams(effectiveParamString),
    [effectiveParamString],
  );
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
  const [sourceSearchDraft, setSourceSearchDraft] = useState("");
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
  const modeParam = params.get("mode");
  // 默认落地页 = 最新；只有显式 mode=selected 才高亮「精选」(URL 带 mode，不再静默回退最新)。
  const rawMode: SearchMode =
    modeParam === "personalized"
      ? "personalized"
      : modeParam === "selected"
        ? "selected"
        : "latest";
  // 「推荐」只在有主题板时出现；URL 残留 mode=personalized 时把高亮回退到「最新」。
  const mode: SearchMode = rawMode === "personalized" && !hasBoards ? "latest" : rawMode;
  const visibleModes: readonly SearchMode[] = hasBoards
    ? SEARCH_MODES
    : SEARCH_MODES.filter((value) => value !== "personalized");
  const selectedSourceGroups = parseSourceGroupParam(params.get("sourceTypes"));
  const selectedEventCategory = params.get("category") as EventCategory | null;
  const activeSourceGroups = useMemo(() => {
    const groups = new Set<SourceGroup>();
    for (const option of sourceOptions) {
      const group = groupForSourceType(option.sourceType);
      if (group) groups.add(group);
    }
    return SOURCE_GROUPS.filter((group) => groups.has(group));
  }, [sourceOptions]);
  const activeEventCategories = useMemo(() => {
    const categories = new Set(availableEventCategories);
    if (selectedEventCategory) categories.add(selectedEventCategory);
    return EVENT_CATEGORIES.filter((value) => categories.has(value));
  }, [availableEventCategories, selectedEventCategory]);
  const normalizedSourceSearch = sourceSearchDraft.trim().toLowerCase();
  const visibleSourceOptions = useMemo(() => {
    if (!normalizedSourceSearch) return sourceOptions;
    return sourceOptions.filter((option) => {
      const haystack = [option.name, option.platform, option.sourceType, ...option.categories]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSourceSearch);
    });
  }, [normalizedSourceSearch, sourceOptions]);
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
      setOptimisticParams({ base: routeParamString, value: qs });
      startTransition(() => {
        router.push(href);
      });
    },
    [params, routeParamString, router, startTransition],
  );

  const setParam = (key: string, value: ChipValue) =>
    navigate((next) => {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    });

  const setMode = (value: SearchMode) =>
    navigate((next) => {
      // 精选/推荐写入显式 mode；最新是默认，删掉 mode 保持干净 URL。
      if (value === "selected") next.set("mode", "selected");
      else if (value === "personalized") next.set("mode", "personalized");
      else next.delete("mode");
    });

  const selectTime = (value: TimeChoice) => {
    setTimeDraft({ routeValue: routeTimeChoice, value });
    if (value !== "custom") {
      setFromDraft({ routeValue: fromParam, value: "" });
      setToDraft({ routeValue: toParam, value: "" });
    }
  };

  const toggleSourceGroup = (group: SourceGroup) =>
    navigate((next) => {
      const current = parseSourceGroupParam(next.get("sourceTypes"));
      if (current.size === 1 && current.has(group)) {
        next.delete("sourceTypes");
      } else {
        next.set("sourceTypes", expandGroups([group]).join(","));
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
    setOptimisticParams({ base: routeParamString, value: "" });
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
    params.get("itags") ||
    params.get("isources") ||
    params.get("category");

  return (
    <section
      className={`search ${isPending ? "is-pending" : ""}`}
      aria-label={m.submit}
      aria-busy={isPending}
    >
      <div className="search-main-row">
        <div className="search-mode-tabs" role="group" aria-label={m.modeLabel}>
          {visibleModes.map((value) => (
            <button
              key={value}
              type="button"
              className={`search-mode-tab ${mode === value ? "is-active" : ""}`}
              aria-pressed={mode === value}
              data-tooltip={
                value === "latest"
                  ? "按发布时间查看全部动态"
                  : value === "selected"
                    ? "只看经过筛选的精选内容"
                    : "按主题板偏好查看推荐"
              }
              onClick={() => setMode(value)}
            >
              {m.mode[value]}
            </button>
          ))}
        </div>

        <div className="search-filter-line">
          <div className="search-facet-row" role="group" aria-label={m.sourceGroupLabel}>
            <span className="filter-label">{m.sourceGroupLabel}</span>
            {activeSourceGroups.map((group) => {
              const active = selectedSourceGroups.has(group);
              return (
                <button
                  key={group}
                  type="button"
                  className={`chip ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  data-tooltip={`只看${m.sourceGroup[group]}类来源`}
                  onClick={() => toggleSourceGroup(group)}
                >
                  {m.sourceGroup[group]}
                </button>
              );
            })}
          </div>
          <div className="search-category-actions">
            <div className="search-facet-row" role="group" aria-label={m.eventCategoryLabel}>
              <span className="filter-label">{m.eventCategoryLabel}</span>
              {activeEventCategories.map((value) => {
                const active = selectedEventCategory === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${active ? "is-active" : ""}`}
                    aria-pressed={active}
                    data-tooltip={`只看${m.eventCategory[value]}类内容`}
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
          {/* 显式搜索按钮：点击即搜；同时让表单有 submit，按 Enter 也能可靠触发。 */}
            <button type="submit" className="search-go">
            {m.submit}
          </button>
          <div className="search-filter-popover">
            <button
              type="button"
              className={`search-filter-toggle ${filterPanelOpen || hasPanelFilters ? "is-active" : ""}`}
              aria-expanded={filterPanelOpen}
              aria-controls="reader-search-filter-panel"
              data-tooltip="展开时间、评分、模式和信源筛选"
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

                <div className="search-filter-section search-filter-mobile-section" role="group" aria-label={m.modeLabel}>
                  <span className="filter-label">{m.modeLabel}</span>
                  <div className="search-filter-options">
                    {visibleModes.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`chip ${mode === value ? "is-active" : ""}`}
                        aria-pressed={mode === value}
                        onClick={() => setMode(value)}
                      >
                        {m.mode[value]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="search-filter-section search-filter-mobile-section" role="group" aria-label={m.sourceGroupLabel}>
                  <span className="filter-label">{m.sourceGroupLabel}</span>
                  <div className="search-filter-options">
                    {activeSourceGroups.map((group) => {
                      const active = selectedSourceGroups.has(group);
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
                </div>

                <div className="search-filter-section search-filter-mobile-section" role="group" aria-label={m.eventCategoryLabel}>
                  <span className="filter-label">{m.eventCategoryLabel}</span>
                  <div className="search-filter-options">
                    {activeEventCategories.map((value) => {
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
                </div>

                {sourceOptions.length > 0 && (
                  <div className="search-filter-section search-filter-source-section" role="group" aria-label={m.sourcePickLabel}>
                    <span className="filter-label">
                      {m.sourcePickLabel}
                      {selectedSources.size > 0 ? `（已选 ${selectedSources.size}）` : ""}
                    </span>
                    <input
                      type="search"
                      className="search-source-search"
                      value={sourceSearchDraft}
                      onChange={(e) => setSourceSearchDraft(e.target.value)}
                      placeholder={m.sourcePickSearchPlaceholder}
                      aria-label={m.sourcePickSearchPlaceholder}
                    />
                    <div className="search-source-grid">
                      {visibleSourceOptions.map((option) => {
                        const active = selectedSources.has(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`chip ${active ? "is-active" : ""}`}
                            aria-pressed={active}
                            data-tooltip={`只看 ${option.name} 的动态`}
                            onClick={() => toggleSourceDraft(option.id)}
                          >
                            {option.name}
                            <span className="source-count" aria-label={`${option.eventCount} 条动态`}>
                              {option.eventCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {visibleSourceOptions.length === 0 && (
                      <p className="search-source-empty">{m.sourcePickEmpty}</p>
                    )}
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
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API download, not a Next page */}
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
