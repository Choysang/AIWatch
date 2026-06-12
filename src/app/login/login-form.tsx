"use client";

// Reader-facing auth form. Anonymous reading stays open; signing in gives each reader an
// account for comments and notifications. Two credential modes — email OTP (default) and
// email + password (sign-in or sign-up) — plus OAuth buttons shown only when the server
// has provider credentials configured.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { messages } from "@/i18n";

const MIN_PASSWORD_LENGTH = 8;

type Mode = "otp" | "password";

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
  const [mode, setMode] = useState<Mode>("otp");
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setOtp("");
    setPassword("");
    setCodeSent(false);
    setIsSignUp(false);
  }

  function onSignedIn() {
    router.push(next);
    router.refresh();
  }

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

  async function submitOtp() {
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
    onSignedIn();
  }

  async function submitPassword() {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.passwordTooShort);
      return;
    }
    setPending(true);
    const result = isSignUp
      ? await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.trim().split("@")[0] || "reader",
        })
      : await authClient.signIn.email({ email: email.trim(), password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? (isSignUp ? t.signUpFailed : t.signInFailed));
      return;
    }
    onSignedIn();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "otp") await submitOtp();
    else await submitPassword();
  }

  async function onOauthSignIn(provider: "google" | "wechat") {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.social({ provider, callbackURL: next });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? (provider === "google" ? t.googleFailed : t.wechatFailed));
    }
  }

  const otpSubmitLabel = codeSent ? t.signInSubmit : t.sendCode;
  const passwordSubmitLabel = isSignUp ? t.signUpSubmit : t.passwordSubmit;
  const submitDisabled =
    pending ||
    sendingCode ||
    !email.trim() ||
    (mode === "otp" ? codeSent && !otp.trim() : !password);

  return (
    <form className="login-card card" onSubmit={onSubmit}>
      <h1 style={{ fontFamily: "var(--font-serif)", marginTop: 0 }}>
        {messages.appName} · {t.signInTitle}
      </h1>

      <div className="login-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "otp"}
          className={mode === "otp" ? "login-tab login-tab-active" : "login-tab"}
          onClick={() => switchMode("otp")}
        >
          {t.otpTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          className={mode === "password" ? "login-tab login-tab-active" : "login-tab"}
          onClick={() => switchMode("password")}
        >
          {t.passwordTab}
        </button>
      </div>

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

      {(mode === "otp" || isSignUp) && (
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

      {mode === "otp" && codeSent && (
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

      {mode === "password" && (
        <>
          <label htmlFor="password">{t.passwordLabel}</label>
          <input
            id="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            required
          />
        </>
      )}

      <button type="submit" disabled={submitDisabled}>
        {pending || sendingCode
          ? t.submitting
          : mode === "otp"
            ? otpSubmitLabel
            : passwordSubmitLabel}
      </button>

      {mode === "otp" && codeSent && (
        <button type="button" className="link-button login-resend" onClick={sendCode} disabled={sendingCode}>
          {t.resendCode}
        </button>
      )}

      {mode === "password" && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setIsSignUp((v) => !v);
            setError(null);
          }}
        >
          {isSignUp ? t.toSignIn : t.toSignUp}
        </button>
      )}

      {googleEnabled && (
        <button
          type="button"
          className="login-oauth-button"
          onClick={() => onOauthSignIn("google")}
          disabled={pending}
        >
          {t.googleSubmit}
        </button>
      )}

      {wechatEnabled && (
        <button
          type="button"
          className="login-oauth-button"
          onClick={() => onOauthSignIn("wechat")}
          disabled={pending}
        >
          {t.wechatSubmit}
        </button>
      )}

      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
