import Link from "next/link";

import { BrandMark } from "./brand-mark";

interface AuthCardProps {
  mode: "login" | "register";
}

export function AuthCard({ mode }: AuthCardProps) {
  const isLogin = mode === "login";
  return (
    <main className="authPage">
      <section className="authIntro">
        <BrandMark />
        <p className="eyebrow">ENGINEERING WITH TRACEABILITY</p>
        <h1>One calculation record, consistent on every device.</h1>
        <p>
          Verified inputs, units, assumptions, code editions, results, and
          review history—from desktop to site visit.
        </p>
      </section>
      <section className="authCard" aria-labelledby="auth-title">
        <div>
          <p className="eyebrow">SECURE ACCOUNT ACCESS</p>
          <h2 id="auth-title">
            {isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p className="muted">
            {isLogin
              ? "Log in before opening your projects and calculation modules."
              : "A verified email address is required on every platform."}
          </p>
        </div>
        <form className="authForm">
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="engineer@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={12}
              placeholder="••••••••••••"
            />
          </label>
          <button type="button" disabled aria-disabled="true">
            {isLogin ? "Log in" : "Create account"}
          </button>
          <p className="setupNotice">
            Repository preview only. Connect the managed identity provider
            before enabling account submission.
          </p>
        </form>
        <p className="authSwitch">
          {isLogin ? "New to ÑOLA?" : "Already have an account?"}{" "}
          <Link href={isLogin ? "/register" : "/login"}>
            {isLogin ? "Create an account" : "Log in"}
          </Link>
        </p>
      </section>
    </main>
  );
}
