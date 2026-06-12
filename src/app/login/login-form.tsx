"use client";

// Reader-facing auth form. Anonymous reading stays open; signing in gives each reader an
// account for comments and notifications. Email OTP is the default path, with OAuth
// buttons shown only when the server has provider credentials configured.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { messages } from "@/i18n";

export function LoginForm({
  googleEnabled,
  wechatEnabled,
  next,
}: {
  googleEnabled: boolean;
  wechatEnabled: boolean;
  next: string;
}) {
  const router = useRouter();
  const t = messages.login;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  async function sendCode() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setError(null);
    setSendingCode(true);
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: trimmedEmail,
      type: "sign-in",
    });
    setSendingCode(false);
    if (result.error) {
      setError(result.error.message ?? t.codeSendFailed);
      return;
    }
    setCodeSent(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeSent) {
      await sendCode();
      return;
    }

    setError(null);
    setPending(true);
    const result = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: otp.trim(),
      name: name.trim() || undefined,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t.signInFailed);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function onGoogleSignIn() {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t.googleFailed);
    }
  }

  async function onWechatSignIn() {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.social({
      provider: "wechat",
      callbackURL: next,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t.wechatFailed);
    }
  }

  return (
    <form className="login-card card" onSubmit={onSubmit}>
      <h1 style={{ fontFamily: "var(--font-serif)", marginTop: 0 }}>
        {messages.appName} · {t.signInTitle}
      </h1>

      <label htmlFor="email">{t.emailLabel}</label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setCodeSent(false);
          setOtp("");
          setError(null);
        }}
        required
      />

      <label htmlFor="name">{t.nameLabel}</label>
      <input
        id="name"
        type="text"
        autoComplete="nickname"
        placeholder={t.namePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {codeSent && (
        <>
          <label htmlFor="otp">{t.codeLabel}</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
          <p className="login-hint">{t.codeSent}</p>
        </>
      )}

      <button
        type="submit"
        disabled={pending || sendingCode || !email.trim() || (codeSent && !otp.trim())}
      >
        {pending || sendingCode ? t.submitting : codeSent ? t.signInSubmit : t.sendCode}
      </button>

      {codeSent && (
        <button type="button" className="link-button login-resend" onClick={sendCode} disabled={sendingCode}>
          {t.resendCode}
        </button>
      )}

      {googleEnabled && (
        <button type="button" className="login-oauth-button" onClick={onGoogleSignIn} disabled={pending}>
          {t.googleSubmit}
        </button>
      )}

      {wechatEnabled && (
        <button type="button" className="login-oauth-button" onClick={onWechatSignIn} disabled={pending}>
          {t.wechatSubmit}
        </button>
      )}

      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
