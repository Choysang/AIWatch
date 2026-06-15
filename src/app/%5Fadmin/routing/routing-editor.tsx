// Client editor for model routing (v0.5 C1). Per-task provider/model controls; save/reset
// POST to /api/_admin/routing and router.refresh() to re-read the effective routing. The
// worker applies the change on its next refresh cron.

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { messages } from "@/i18n";

export interface RoutingRow {
  task: string;
  provider: string;
  model: string;
  overridden: boolean;
  providerHasKey: boolean;
  priceLabel: string | null;
}

export interface ProviderOption {
  name: string;
  hasKey: boolean;
}

type Draft = { provider: string; model: string };

export function RoutingEditor({
  rows,
  providers,
}: {
  rows: RoutingRow[];
  providers: ProviderOption[];
}) {
  const m = messages.admin.routing;
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(rows.map((r) => [r.task, { provider: r.provider, model: r.model }])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setDraft = (task: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [task]: { ...(d[task] ?? { provider: "", model: "" }), ...patch } }));

  const post = async (task: string, body: Record<string, unknown>) => {
    setBusy(task);
    setError(null);
    try {
      const res = await fetch("/api/_admin/routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, ...body }),
      });
      if (!res.ok) {
        setError(m.saveError);
        return;
      }
      router.refresh();
    } catch {
      setError(m.saveError);
    } finally {
      setBusy(null);
    }
  };

  const save = (task: string) => {
    const draft = drafts[task];
    if (!draft?.model.trim()) {
      setError(m.modelRequired);
      return;
    }
    void post(task, { provider: draft.provider, model: draft.model.trim() });
  };
  const reset = (task: string) => void post(task, { reset: true });

  const taskLabel = (task: string) => m.task[task as keyof typeof m.task] ?? task;

  return (
    <section className="routing-editor">
      {error && <output className="composer-error">{error}</output>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>{m.col.task}</th>
            <th>{m.col.provider}</th>
            <th>{m.col.model}</th>
            <th>{m.col.price}</th>
            <th>{m.col.status}</th>
            <th>{m.col.actions}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const draft = drafts[r.task] ?? { provider: r.provider, model: r.model };
            const dirty = draft.provider !== r.provider || draft.model !== r.model;
            return (
              <tr key={r.task}>
                <td data-label={m.col.task}>
                  <strong>{taskLabel(r.task)}</strong>
                  {r.overridden && <span className="routing-badge">{m.overridden}</span>}
                </td>
                <td data-label={m.col.provider}>
                  <select
                    value={draft.provider}
                    onChange={(e) => setDraft(r.task, { provider: e.target.value })}
                    disabled={busy === r.task}
                  >
                    {providers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                        {p.hasKey ? "" : " ⚠"}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label={m.col.model}>
                  <input
                    value={draft.model}
                    onChange={(e) => setDraft(r.task, { model: e.target.value })}
                    disabled={busy === r.task}
                  />
                </td>
                <td data-label={m.col.price}>{r.priceLabel ?? m.noPrice}</td>
                <td data-label={m.col.status}>
                  <span className={`pill ${r.providerHasKey ? "healthy" : "degraded"}`}>
                    {r.providerHasKey ? m.keyOk : m.keyMissing}
                  </span>
                </td>
                <td data-label={m.col.actions} className="routing-actions">
                  <button
                    type="button"
                    onClick={() => save(r.task)}
                    disabled={busy === r.task || !dirty}
                  >
                    {m.save}
                  </button>
                  {r.overridden && (
                    <button
                      type="button"
                      className="routing-reset"
                      onClick={() => reset(r.task)}
                      disabled={busy === r.task}
                    >
                      {m.reset}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="routing-note">{m.note}</p>
    </section>
  );
}
