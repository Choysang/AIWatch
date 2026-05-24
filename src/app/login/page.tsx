"use client";

// Minimal email/password login (Slice 0). On success, go to the admin console.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { messages } from "@/i18n";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(error.message ?? "登录失败");
      return;
    }
    router.push("/_admin");
    router.refresh();
  }

  return (
    <main className="page">
      <form className="login-card card" onSubmit={onSubmit}>
        <h1 style={{ fontFamily: "var(--font-serif)", marginTop: 0 }}>
          {messages.appName} · 登录
        </h1>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? "登录中…" : "登录"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </main>
  );
}
