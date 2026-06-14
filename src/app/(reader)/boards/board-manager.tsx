// Client board manager (v0.5 A1): list / create / edit / delete the reader's topic boards
// and pick their tags. Mutations go through /api/boards (cookie-scoped identity); the list
// stays authoritative from the API responses, so the SSR initial list can be empty on a
// first visit without breaking anything. "进入" links to the home feed pre-filtered to the
// board's tags (/?tags=...), reusing the full timeline.

"use client";

import Link from "next/link";
import { useState } from "react";
import { messages } from "@/i18n";

export interface BoardView {
  id: string;
  name: string;
  emoji: string | null;
  tags: string[];
  sortOrder: number;
}

interface DraftState {
  id: string | null; // null = creating a new board; otherwise the board being edited
  name: string;
  emoji: string;
  tags: string[];
  tagInput: string;
}

const EMPTY_DRAFT: DraftState = { id: null, name: "", emoji: "", tags: [], tagInput: "" };

/** Open a board = the home feed filtered to its tags (ANY-of overlap). No tags = all feed. */
function boardHref(tags: string[]): string {
  return tags.length === 0 ? "/" : `/?tags=${encodeURIComponent(tags.join(","))}`;
}

function bySortOrder(a: BoardView, b: BoardView): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function BoardManager({
  initialBoards,
  popularTags,
}: {
  initialBoards: BoardView[];
  popularTags: string[];
}) {
  const m = messages.boards;
  const [boards, setBoards] = useState<BoardView[]>([...initialBoards].sort(bySortOrder));
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const startCreate = () => {
    setError(null);
    setDraft({ ...EMPTY_DRAFT });
  };
  const startEdit = (b: BoardView) => {
    setError(null);
    setDraft({ id: b.id, name: b.name, emoji: b.emoji ?? "", tags: [...b.tags], tagInput: "" });
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
        body: JSON.stringify({ name, emoji: draft.emoji.trim() || null, tags: draft.tags }),
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
        <button type="button" className="boards-create" onClick={startCreate} disabled={pending || draft !== null}>
          + {m.create}
        </button>
      </div>

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
                <span className="board-tag-count">{m.tagCountSuffix(b.tags.length)}</span>
              </div>
              {b.tags.length > 0 ? (
                <div className="board-tags">
                  {b.tags.map((t) => (
                    <span key={t} className="board-tag">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="board-tags-empty">{m.noTags}</p>
              )}
              <div className="board-card-actions">
                <Link className="board-open" href={boardHref(b.tags)}>
                  {m.open} →
                </Link>
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
