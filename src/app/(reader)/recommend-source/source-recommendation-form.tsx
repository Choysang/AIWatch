"use client";

import { type FormEvent, useState, useTransition } from "react";
import { messages } from "@/i18n";
import { PLATFORM_LABEL, PLATFORMS, SOURCE_PROFILE_LABEL, SOURCE_PROFILES } from "@/sources/source-form";

interface FormState {
  name: string;
  handle: string;
  platform: string;
  sourceProfile: string;
  url: string;
  recommendedBy: string;
  recommendReason: string;
  contact: string;
  error: string | null;
  done: boolean;
}

const EMPTY: FormState = {
  name: "",
  handle: "",
  platform: "x",
  sourceProfile: "community_practice",
  url: "",
  recommendedBy: "",
  recommendReason: "",
  contact: "",
  error: null,
  done: false,
};

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="admin-field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function SourceRecommendationForm() {
  const m = messages.sourceRecommendation;
  const [state, setState] = useState<FormState>(EMPTY);
  const [isPending, startTransition] = useTransition();

  const setField = (key: keyof FormState, value: string) => {
    setState((s) => ({ ...s, [key]: value, error: null }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = state.name.trim();
    const url = state.url.trim();
    const recommendReason = state.recommendReason.trim();
    if (!name || !url || !recommendReason) {
      setState((s) => ({ ...s, error: m.empty }));
      return;
    }

    startTransition(async () => {
      try {
        const contact = state.contact.trim();
        const res = await fetch("/api/contributions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "source_recommendation",
            reason: recommendReason,
            contact: contact || undefined,
            proposedChange: {
              name,
              url,
              platform: state.platform,
              sourceProfile: state.sourceProfile,
              handle: state.handle.trim() || undefined,
              recommendedBy: state.recommendedBy.trim() || contact || undefined,
              recommendReason,
            },
          }),
        });
        if (!res.ok) {
          setState((s) => ({ ...s, error: m.error }));
          return;
        }
        setState({ ...EMPTY, done: true });
      } catch {
        setState((s) => ({ ...s, error: m.error }));
      }
    });
  };

  if (state.done) {
    return (
      <div className="card feedback-done">
        <p>{m.success}</p>
        <button type="button" onClick={() => setState(EMPTY)}>
          {m.another}
        </button>
      </div>
    );
  }

  return (
    <form className="card source-recommendation-form" onSubmit={handleSubmit}>
      <div className="admin-form-grid">
        <Field label={m.nameLabel}>
          <input
            value={state.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder={m.namePlaceholder}
            maxLength={200}
            required
            disabled={isPending}
          />
        </Field>
        <Field label={m.handleLabel}>
          <input
            value={state.handle}
            onChange={(e) => setField("handle", e.target.value)}
            placeholder={m.handlePlaceholder}
            maxLength={120}
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="admin-form-grid">
        <Field label={m.platformLabel}>
          <select value={state.platform} onChange={(e) => setField("platform", e.target.value)} disabled={isPending}>
            {PLATFORMS.map((value) => (
              <option key={value} value={value}>
                {PLATFORM_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={m.profileLabel}>
          <select
            value={state.sourceProfile}
            onChange={(e) => setField("sourceProfile", e.target.value)}
            disabled={isPending}
          >
            {SOURCE_PROFILES.map((value) => (
              <option key={value} value={value}>
                {SOURCE_PROFILE_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={m.urlLabel}>
        <input
          type="url"
          value={state.url}
          onChange={(e) => setField("url", e.target.value)}
          placeholder={m.urlPlaceholder}
          required
          disabled={isPending}
        />
      </Field>
      <Field label={m.recommendedByLabel}>
        <input
          value={state.recommendedBy}
          onChange={(e) => setField("recommendedBy", e.target.value)}
          placeholder={m.recommendedByPlaceholder}
          maxLength={120}
          disabled={isPending}
        />
      </Field>
      <Field label={m.reasonLabel}>
        <textarea
          value={state.recommendReason}
          onChange={(e) => setField("recommendReason", e.target.value)}
          placeholder={m.reasonPlaceholder}
          rows={4}
          maxLength={1000}
          required
          disabled={isPending}
        />
      </Field>
      <Field label={m.contactLabel}>
        <input
          value={state.contact}
          onChange={(e) => setField("contact", e.target.value)}
          placeholder={m.contactPlaceholder}
          maxLength={200}
          disabled={isPending}
        />
      </Field>
      <div className="composer-actions">
        {state.error && <output className="composer-error">{state.error}</output>}
        <button type="submit" disabled={isPending}>
          {isPending ? m.submitting : m.submit}
        </button>
      </div>
    </form>
  );
}
