// Feedback form (client island). Anonymous-friendly: a required body + optional contact,
// POSTed to /api/feedback. Mirrors the composer pattern — useTransition for pending state,
// a generic error on failure, a success state with a path back to submit another.

"use client";

import { type FormEvent, useState, useTransition } from "react";
import { messages } from "@/i18n";

interface FormState {
  body: string;
  contact: string;
  error: string | null;
  done: boolean;
}

const EMPTY: FormState = { body: "", contact: "", error: null, done: false };

export function FeedbackForm() {
  const m = messages.feedback;
  const [state, setState] = useState<FormState>(EMPTY);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = state.body.trim();
    if (body.length === 0) {
      setState((s) => ({ ...s, error: m.empty }));
      return;
    }
    const contact = state.contact.trim();

    startTransition(async () => {
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(contact ? { body, contact } : { body }),
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
    <form className="card feedback-form" onSubmit={handleSubmit}>
      <label htmlFor="feedback-body" className="visually-hidden">
        {m.placeholder}
      </label>
      <textarea
        id="feedback-body"
        placeholder={m.placeholder}
        value={state.body}
        onChange={(e) => setState((s) => ({ ...s, body: e.target.value, error: null }))}
        rows={6}
        maxLength={4000}
        disabled={isPending}
      />
      <label htmlFor="feedback-contact">{m.contactLabel}</label>
      <input
        id="feedback-contact"
        type="text"
        placeholder={m.contactPlaceholder}
        value={state.contact}
        onChange={(e) => setState((s) => ({ ...s, contact: e.target.value }))}
        maxLength={200}
        disabled={isPending}
      />
      <div className="composer-actions">
        {state.error && <output className="composer-error">{state.error}</output>}
        <button type="submit" disabled={isPending || state.body.trim().length === 0}>
          {isPending ? m.submitting : m.submit}
        </button>
      </div>
    </form>
  );
}
