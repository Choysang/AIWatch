// Client board manager (v0.5 A1): list / create / edit / delete the reader's topic boards
// and pick their tags. Mutations go through /api/boards (cookie-scoped identity); the list
// stays authoritative from the API responses, so the SSR initial list can be empty on a
// first visit without breaking anything. "进入" links to the home feed pre-filtered to the
// board's tags (/?tags=...), reusing the full timeline.

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { messages } from "@/i18n";

export interface BoardView {
  id: string;
  name: string;
  emoji: string | null;
  tags: string[];
  sourceIds: string[];
  sortOrder: number;
}

export interface BoardSourceOption {
  id: string;
  name: string;
  platform: string;
}

interface DraftState {
  id: string | null; // null = creating a new board; otherwise the board being edited
  name: string;
  emoji: string;
  tags: string[];
  tagInput: string;
  sourceIds: string[];
}

const EMPTY_DRAFT: DraftState = { id: null, name: "", emoji: "", tags: [], tagInput: "", sourceIds: [] };

/**
 * Open a board = the home feed filtered to its interest (tags OR sources), via the itags /
 * isources params (mode=latest so it shows all matches, not just 精选). No tags + no sources
 * = the whole feed.
 */
function boardHref(tags: string[], sourceIds: string[]): string {
  if (tags.length === 0 && sourceIds.length === 0) return "/";
  const params = new URLSearchParams();
  params.set("mode", "latest");
  if (tags.length) params.set("itags", tags.join(","));
  if (sourceIds.length) params.set("isources", sourceIds.join(","));
  return `/?${params.toString()}`;
}

/** A board's brief (B2): the interest (tags/sources) carried into /brief. Null when empty. */
function briefHref(tags: string[], sourceIds: string[]): string | null {
  if (tags.length === 0 && sourceIds.length === 0) return null;
  const params = new URLSearchParams();
  if (tags.length) params.set("itags", tags.join(","));
  if (sourceIds.length) params.set("isources", sourceIds.join(","));
  return `/brief?${params.toString()}`;
}

function bySortOrder(a: BoardView, b: BoardView): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function BoardManager({
  initialBoards,
  popularTags,
  sourceOptions,
}: {
  initialBoards: BoardView[];
  popularTags: string[];
  sourceOptions: BoardSourceOption[];
}) {
  const m = messages.boards;
  const [boards, setBoards] = useState<BoardView[]>([...initialBoards].sort(bySortOrder));
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportMsg(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/boards/opml-import", {
        method: "POST",
        headers: { "content-type": "text/x-opml" },
        body: text,
      });
      if (res.status === 201) {
        const { submitted } = (await res.json()) as { submitted: number };
        setImportMsg(m.importSubmitted(submitted));
      } else if (res.status === 422) {
        setImportMsg(m.importNoFeeds);
      } else {
        setImportMsg(m.importError);
      }
    } catch {
      setImportMsg(m.importError);
    } finally {
      setImporting(false);
    }
  };

  const startCreate = () => {
    setError(null);
    setDraft({ ...EMPTY_DRAFT });
  };
  const startEdit = (b: BoardView) => {
    setError(null);
    setDraft({
      id: b.id,
      name: b.name,
      emoji: b.emoji ?? "",
      tags: [...b.tags],
      tagInput: "",
      sourceIds: [...b.sourceIds],
    });
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  const addTag = (raw: string) => {
    const tag = raw.trim();
    setDraft((d) => {
      if (!d) return d;
      if (!tag || d.tags.includes(tag)) return { ...d, tagInput: "" };
      return { ...d, tags: [...d.tags, tag], tagInput: "" };
    });
  };
  const removeTag = (tag: string) =>
    setDraft((d) => (d ? { ...d, tags: d.tags.filter((t) => t !== tag) } : d));
  const toggleTag = (tag: string) =>
    setDraft((d) => {
      if (!d) return d;
      return d.tags.includes(tag)
        ? { ...d, tags: d.tags.filter((t) => t !== tag) }
        : { ...d, tags: [...d.tags, tag] };
    });
  const toggleSource = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      return d.sourceIds.includes(id)
        ? { ...d, sourceIds: d.sourceIds.filter((s) => s !== id) }
        : { ...d, sourceIds: [...d.sourceIds, id] };
    });

  const messageForError = (code: string): string => {
    if (code === "name_conflict") return m.nameConflict;
    if (code === "board_limit") return m.limitReached;
    if (code === "empty_name") return m.emptyName;
    return m.saveError;
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError(m.emptyName);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const isEdit = draft.id !== null;
      const res = await fetch(isEdit ? `/api/boards/${draft.id}` : "/api/boards", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          emoji: draft.emoji.trim() || null,
          tags: draft.tags,
          sourceIds: draft.sourceIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(messageForError(body.error ?? ""));
        return;
      }
      const { board } = (await res.json()) as { board: BoardView };
      setBoards((prev) => [...prev.filter((b) => b.id !== board.id), board].sort(bySortOrder));
      setDraft(null);
    } catch {
      setError(m.saveError);
    } finally {
      setPending(false);
    }
  };

  const doDelete = async (id: string) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setError(m.deleteError);
        return;
      }
      setBoards((prev) => prev.filter((b) => b.id !== id));
      setConfirmingDelete(null);
    } catch {
      setError(m.deleteError);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="boards">
      <div className="boards-toolbar">
        <div className="boards-toolbar-left">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API download, not a Next page */}
          <a className="boards-export" href="/api/boards/opml" title={m.exportHint}>
            ↓ {m.exportOpml}
          </a>
          <button
            type="button"
            className="boards-export"
            title={m.importHint}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            ↑ {importing ? m.importing : m.importOpml}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = "";
            }}
          />
        </div>
        <button type="button" className="boards-create" onClick={startCreate} disabled={pending || draft !== null}>
          + {m.create}
        </button>
      </div>
      {importMsg && <output className="boards-import-msg">{importMsg}</output>}

      {draft && (
        <div className="board-editor card">
          <div className="board-editor-row">
            <label className="board-field board-field-emoji">
              <span>{m.emojiLabel}</span>
              <input
                value={draft.emoji}
                maxLength={8}
                placeholder={m.emojiPlaceholder}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                disabled={pending}
              />
            </label>
            <label className="board-field board-field-name">
              <span>{m.nameLabel}</span>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                value={draft.name}
                maxLength={40}
                placeholder={m.namePlaceholder}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                disabled={pending}
                autoFocus
              />
            </label>
          </div>

          <div className="board-field">
            <span>{m.tagsLabel}</span>
            <p className="board-tags-hint">{m.tagsHint}</p>
            {draft.tags.length > 0 && (
              <div className="board-selected-tags">
                {draft.tags.map((t) => (
                  <button key={t} type="button" className="chip is-active" onClick={() => removeTag(t)} disabled={pending}>
                    {t} ✕
                  </button>
                ))}
              </div>
            )}
            <div className="board-tag-input-row">
              <input
                value={draft.tagInput}
                placeholder={m.tagInputPlaceholder}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, tagInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(draft.tagInput);
                  }
                }}
                disabled={pending}
              />
              <button type="button" onClick={() => addTag(draft.tagInput)} disabled={pending}>
                {m.tagAdd}
              </button>
            </div>
            {popularTags.length > 0 && (
              <div className="board-popular-tags">
                <span className="filter-label">{m.popularTags}</span>
                <div className="board-popular-chips">
                  {popularTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`chip ${draft.tags.includes(t) ? "is-active" : ""}`}
                      aria-pressed={draft.tags.includes(t)}
                      onClick={() => toggleTag(t)}
                      disabled={pending}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {sourceOptions.length > 0 && (
            <div className="board-field">
              <span>
                {m.sourcesLabel}
                {draft.sourceIds.length > 0 ? `（已选 ${draft.sourceIds.length}）` : ""}
              </span>
              <p className="board-tags-hint">{m.sourcesHint}</p>
              <div className="board-source-grid">
                {sourceOptions.map((option) => {
                  const active = draft.sourceIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`chip ${active ? "is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => toggleSource(option.id)}
                      disabled={pending}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <output className="composer-error">{error}</output>}
          <div className="board-editor-actions">
            <button type="button" className="chip chip-clear" onClick={cancel} disabled={pending}>
              {m.cancel}
            </button>
            <button type="button" className="search-submit" onClick={save} disabled={pending}>
              {pending ? m.saving : m.save}
            </button>
          </div>
        </div>
      )}

      {error && !draft && <output className="composer-error">{error}</output>}

      {boards.length === 0 && !draft ? (
        <div className="empty">{m.empty}</div>
      ) : (
        <ul className="board-grid">
          {boards.map((b) => (
            <li key={b.id} className="board-card">
              <div className="board-card-head">
                <span className="board-emoji" aria-hidden="true">
                  {b.emoji || "📌"}
                </span>
                <strong className="board-name">{b.name}</strong>
                <span className="board-tag-count">
                  {m.tagCountSuffix(b.tags.length)}
                  {b.sourceIds.length > 0 ? ` · ${m.sourceCountSuffix(b.sourceIds.length)}` : ""}
                </span>
              </div>
              {b.tags.length > 0 && (
                <div className="board-tags">
                  {b.tags.map((t) => (
                    <span key={t} className="board-tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {b.tags.length === 0 && b.sourceIds.length === 0 && (
                <p className="board-tags-empty">{m.noTags}</p>
              )}
              <div className="board-card-actions">
                <Link className="board-open" href={boardHref(b.tags, b.sourceIds)}>
                  {m.open} →
                </Link>
                {briefHref(b.tags, b.sourceIds) && (
                  <Link className="board-brief" href={briefHref(b.tags, b.sourceIds)!} title={m.briefHint}>
                    {m.brief}
                  </Link>
                )}
                <button type="button" onClick={() => startEdit(b)} disabled={pending || draft !== null}>
                  {m.edit}
                </button>
                {confirmingDelete === b.id ? (
                  <span className="board-delete-confirm">
                    <span>{m.deleteConfirm}</span>
                    <button type="button" onClick={() => doDelete(b.id)} disabled={pending}>
                      {m.delete}
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(null)} disabled={pending}>
                      {m.cancel}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="board-delete"
                    onClick={() => setConfirmingDelete(b.id)}
                    disabled={pending || draft !== null}
                  >
                    {m.delete}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
