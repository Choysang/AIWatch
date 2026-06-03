"use client";

// Reader-facing auth form (SP3.2). Supports both sign-in and self-registration via
// better-auth, and returns the reader to wherever they came from (`next`) instead of always
// bouncing to the admin console. `next` is sanitised on the server (see page.tsx) to a
// same-origin path, so it's safe to push here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { messages } from "@/i18n";

type Mode = "signin" | "register";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const t = messages.login;
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = isRegister
      ? await authClient.signUp.email({ email, password, name: name.trim() || email })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? (isRegister ? t.registerFailed : t.signInFailed));
      return;
    }
    router.push(next);
    router.refresh();
  }

  function toggleMode() {
    setError(null);
    setMode(isRegister ? "signin" : "register");
  }

  return (
    <form className="login-card card" onSubmit={onSubmit}>
      <h1 style={{ fontFamily: "var(--font-serif)", marginTop: 0 }}>
        {messages.appName} · {isRegister ? t.registerTitle : t.signInTitle}
      </h1>

      {isRegister && (
        <>
          <label htmlFor="name">{t.nameLabel}</label>
          <input
            id="name"
            type="text"
            autoComplete="nickname"
            placeholder={t.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </>
      )}

      <label htmlFor="email">{t.emailLabel}</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="password">{t.passwordLabel}</label>
      <input
        id="password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button type="submit" disabled={pending}>
        {pending ? t.submitting : isRegister ? t.registerSubmit : t.signInSubmit}
      </button>

      <button type="button" className="link-button" onClick={toggleMode}>
        {isRegister ? t.toSignIn : t.toRegister}
      </button>

      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
